import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Resend } from 'resend';
import { Role } from '../common/enums/role.enum';
import { AppGateway } from '../gateway/app.gateway';
import { ReportsService } from '../reports/reports.service';
import { QuotationsService } from '../quotations/quotations.service';
import { User } from '../users/entities/user.entity';
import { Notification } from './entities/notification.entity';

/**
 * In-app notifications go through create()/createForRoles() — the single
 * chokepoint that persists the row AND emits the WS event (plan §6.5).
 * Email is direct-send with try/catch + logged failure (decision D12).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  constructor(
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly gateway: AppGateway,
    @Inject(ReportsService) private readonly reports: ReportsService,
    @Inject(QuotationsService) private readonly quotations: QuotationsService,
  ) {}

  async create(input: {
    userId: number;
    type: string;
    payload?: unknown;
  }): Promise<Notification> {
    const notification = await this.notifications.save(
      this.notifications.create({
        user: { id: input.userId },
        type: input.type,
        payload: (input.payload as Record<string, unknown> | undefined) ?? null,
      }),
    );
    this.gateway.emitNotification(input.userId, notification);
    return notification;
  }

  /** Fan-out one notification to every active user holding one of the given roles. */
  async createForRoles(
    type: string,
    payload: unknown,
    roles: Role[],
  ): Promise<number> {
    const recipients = await this.users.find({
      where: { isActive: true, role: In(roles) },
      select: { id: true },
    });
    for (const recipient of recipients) {
      await this.create({ userId: recipient.id, type, payload });
    }
    return recipients.length;
  }

  findAllForUser(userId: number) {
    return this.notifications.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });
  }

  async markAsRead(userId: number, id: number): Promise<Notification> {
    const notification = await this.notifications.findOne({
      where: { id, user: { id: userId } },
    });
    if (!notification) throw new NotFoundException('Notification not found');
    if (!notification.readAt) {
      notification.readAt = new Date();
      await this.notifications.save(notification);
    }
    return notification;
  }

  async sendQuotationEmail(
    quotationId: number,
    recipientEmail: string,
  ): Promise<void> {
    await this.deliverQuotationEmail(quotationId, recipientEmail);
  }

  async testQuotationEmail(quotationId: number, recipientEmail: string) {
    const result = await this.deliverQuotationEmail(
      quotationId,
      recipientEmail,
    );
    return {
      quotationId,
      pdf: { created: true, sizeBytes: result.pdfSizeBytes },
      email: { sent: true, id: result.emailId },
    };
  }

  /**
   * Daily low-stock digest (decision D12): one best-effort email, failures are
   * logged and never throw to the caller.
   */
  async sendLowStockDigest(
    entries: {
      code: string;
      description: string | null;
      available: number;
      threshold: number;
    }[],
  ): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL;
    const to = process.env.DIGEST_RECIPIENT_EMAIL;
    if (!apiKey || !fromEmail || !to) {
      this.logger.warn(
        'Low-stock digest skipped: RESEND_* / DIGEST_RECIPIENT_EMAIL not configured',
      );
      return;
    }
    try {
      const rows = entries
        .map(
          (entry) =>
            `<tr><td><strong>${this.escapeHtml(entry.code)}</strong></td><td>${this.escapeHtml(entry.description ?? '')}</td><td>${entry.available}</td><td>${entry.threshold}</td></tr>`,
        )
        .join('');
      const subject = `Low-stock digest — ${new Date().toISOString().slice(0, 10)}`;
      const html = `<p>Good morning,</p><p>The following ${entries.length} item(s) are at or below their low-stock threshold:</p><table style="border-collapse:collapse;width:100%"><thead><tr style="text-align:left"><th>Code</th><th>Description</th><th>Available</th><th>Threshold</th></tr></thead><tbody>${rows}</tbody></table><p>Regards,<br>Living In interiors</p>`;
      const fromName = process.env.RESEND_FROM_NAME ?? 'Living In interiors';
      const from =
        fromEmail.includes('<') && fromEmail.includes('>')
          ? fromEmail.trim()
          : `${fromName} <${fromEmail.trim()}>`;
      const result = await new Resend(apiKey).emails.send({
        from,
        to,
        subject,
        html,
      });
      if (result.error) throw new Error(result.error.message);
      this.logger.log(
        `Low-stock digest sent to ${to} (${entries.length} item(s))`,
      );
    } catch (error) {
      this.logger.error(
        `Low-stock digest failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async deliverQuotationEmail(
    quotationId: number,
    recipientEmail: string,
  ) {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !fromEmail)
      throw new ServiceUnavailableException('Resend email is not configured');

    const quotation = await this.quotations.findOne(quotationId);
    const totals = await this.quotations.computeTotals(quotationId);
    const pdf = await this.reports.generateQuotationPdf(quotationId);
    const resend = new Resend(apiKey);
    const fromName = process.env.RESEND_FROM_NAME ?? 'Living In interiors';
    const from =
      fromEmail.includes('<') && fromEmail.includes('>')
        ? fromEmail.trim()
        : `${fromName} <${fromEmail.trim()}>`;
    const subject = `Quotation ${quotation.quoteNo}${quotation.projectName ? ` - ${quotation.projectName}` : ''}`;
    const result = await resend.emails.send({
      from,
      to: recipientEmail,
      subject,
      html: `<p>Dear ${this.escapeHtml(quotation.clientName ?? 'Customer')},</p><p>Please find attached quotation <strong>${quotation.quoteNo}</strong>${quotation.projectName ? ` for ${this.escapeHtml(quotation.projectName)}` : ''}.</p><p>Grand total: <strong>${totals.grandTotal.toFixed(2)} ${totals.currency}</strong></p><p>Regards,<br>${this.escapeHtml(fromName)}</p>`,
      attachments: [
        {
          filename: `${quotation.quoteNo}.pdf`,
          content: pdf.toString('base64'),
        },
      ],
    });
    if (result.error)
      throw new ServiceUnavailableException(
        `Resend email failed: ${result.error.message}`,
      );
    return { pdfSizeBytes: pdf.length, emailId: result.data?.id };
  }

  private escapeHtml(value: string): string {
    return value.replace(
      /[&<>'"]/g,
      (character) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          "'": '&#39;',
          '"': '&quot;',
        })[character] ?? character,
    );
  }
}
