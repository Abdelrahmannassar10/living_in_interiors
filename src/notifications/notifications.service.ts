import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Resend } from 'resend';
import { ReportsService } from '../reports/reports.service';
import { QuotationsService } from '../quotations/quotations.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly reports: ReportsService, private readonly quotations: QuotationsService) {}

  async sendQuotationEmail(quotationId: number, recipientEmail: string): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !fromEmail) throw new ServiceUnavailableException('Resend email is not configured');

    const quotation = await this.quotations.findOne(quotationId);
    const totals = await this.quotations.computeTotals(quotationId);
    const pdf = await this.reports.generateQuotationPdf(quotationId);
    const resend = new Resend(apiKey);
    const fromName = process.env.RESEND_FROM_NAME ?? 'Living In interiors';
    const subject = `Quotation ${quotation.quoteNo}${quotation.projectName ? ` - ${quotation.projectName}` : ''}`;
    const result = await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: recipientEmail,
      subject,
      html: `<p>Dear ${this.escapeHtml(quotation.clientName ?? 'Customer')},</p><p>Please find attached quotation <strong>${quotation.quoteNo}</strong>${quotation.projectName ? ` for ${this.escapeHtml(quotation.projectName)}` : ''}.</p><p>Grand total: <strong>${totals.grandTotal.toFixed(2)} ${totals.currency}</strong></p><p>Regards,<br>${this.escapeHtml(fromName)}</p>`,
      attachments: [{ filename: `${quotation.quoteNo}.pdf`, content: pdf.toString('base64') }],
    });
    if (result.error) throw new ServiceUnavailableException(`Resend email failed: ${result.error.message}`);
    if (quotation.status === 'Draft') await this.quotations.updateStatus(quotationId, 'Sent' as never);
  }

  private escapeHtml(value: string): string { return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] ?? character)); }
}