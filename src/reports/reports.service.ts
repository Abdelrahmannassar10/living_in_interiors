import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import Handlebars from 'handlebars';
import puppeteer from 'puppeteer';
import { QuotationsService } from '../quotations/quotations.service';
import { Delivery } from '../deliveries/entities/delivery.entity';
import { SalesOrder } from '../sales-orders/entities/sales-order.entity';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);
  constructor(private readonly quotations: QuotationsService) {}
  async generateQuotationPdf(id: number): Promise<Buffer> {
    const quotation = await this.quotations.findOne(id);
    const totals = await this.quotations.computeTotals(id);
    const template = await fs.readFile(
      path.join(__dirname, 'templates', 'quotation.hbs'),
      'utf8',
    );
    const html = Handlebars.compile(template)({ ...quotation, totals });
    return this.renderToPdf(html);
  }

  async generateDeliveryPdf(payload: {
    delivery: Delivery;
    order: SalesOrder;
  }): Promise<Buffer> {
    const { delivery, order } = payload;
    const template = await fs.readFile(
      path.join(__dirname, 'templates', 'delivery.hbs'),
      'utf8',
    );
    const html = Handlebars.compile(template)({
      deliveryNo: delivery.deliveryNo,
      deliveredAt: delivery.deliveredAt,
      notes: delivery.notes,
      orderNo: order.orderNo,
      clientName: order.clientName ?? order.client?.name ?? null,
      lines: delivery.lines ?? [],
    });
    return this.renderToPdf(html);
  }

  private async renderToPdf(html: string): Promise<Buffer> {
    const browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      return Buffer.from(
        await page.pdf({ format: 'A4', printBackground: true }),
      );
    } finally {
      await browser.close();
    }
  }
}
