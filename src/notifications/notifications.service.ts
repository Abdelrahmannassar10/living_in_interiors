import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Resend } from 'resend';
import { ReportsService } from '../reports/reports.service';
import { QuotationsService } from '../quotations/quotations.service';

/**
 * Email sending is fully decoupled from quotation status transitions:
 * the caller transitions the status (PATCH /quotations/:id/status), then sends
 * the email through this module. There is intentionally no auto status change here.
 */
@Injectable()
export class NotificationsService {
  constructor(
    @Inject(ReportsService) private readonly reports: ReportsService,
    @Inject(QuotationsService) private readonly quotations: QuotationsService,
  ) {}

  async sendQuotationEmail(quotationId: number, recipientEmail: string): Promise<void> {
    await this.deliverQuotationEmail(quotationId, recipientEmail);
  }

  async testQuotationEmail(quotationId: number, recipientEmail: string) {
    const result = await this.deliverQuotationEmail(quotationId, recipientEmail);
    return {
      quotationId,
      pdf: { created: true, sizeBytes: result.pdfSizeBytes },
      email: { sent: true, id: result.emailId },
    };
  }

  private async deliverQuotationEmail(quotationId: number, recipientEmail: string) {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !fromEmail) throw new ServiceUnavailableException('Resend email is not configured');

    const quotation = await this.quotations.findOne(quotationId);
    const totals = await this.quotations.computeTotals(quotationId);
    const pdf = await this.reports.generateQuotationPdf(quotationId);
    const resend = new Resend(apiKey);
    const fromName = process.env.RESEND_FROM_NAME ?? 'Living In interiors';
    const from = fromEmail.includes('<') && fromEmail.includes('>')
      ? fromEmail.trim()
      : `${fromName} <${fromEmail.trim()}>`;
    const subject = `Quotation ${quotation.quoteNo}${quotation.projectName ? ` - ${quotation.projectName}` : ''}`;
    const result = await resend.emails.send({
      from,
      to: recipientEmail,
      subject,
      html: `<p>Dear ${this.escapeHtml(quotation.clientName ?? 'Customer')},</p><p>Please find attached quotation <strong>${quotation.quoteNo}</strong>${quotation.projectName ? ` for ${this.escapeHtml(quotation.projectName)}` : ''}.</p><p>Grand total: <strong>${totals.grandTotal.toFixed(2)} ${totals.currency}</strong></p><p>Regards,<br>${this.escapeHtml(fromName)}</p>`,
      attachments: [{ filename: `${quotation.quoteNo}.pdf`, content: pdf.toString('base64') }],
    });
    if (result.error) throw new ServiceUnavailableException(`Resend email failed: ${result.error.message}`);
    return { pdfSizeBytes: pdf.length, emailId: result.data?.id };
  }

  private escapeHtml(value: string): string { return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] ?? character)); }
}
