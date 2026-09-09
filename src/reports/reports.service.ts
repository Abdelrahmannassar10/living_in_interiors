import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import Handlebars from 'handlebars';
import puppeteer from 'puppeteer';
import { QuotationsService } from '../quotations/quotations.service';
import { RfqsService } from '../rfqs/rfqs.service';
import { Delivery } from '../deliveries/entities/delivery.entity';
import { SalesOrder } from '../sales-orders/entities/sales-order.entity';
import { ItemStock } from '../items/entities/item-stock.entity';
import { SupplierPriceList } from '../purchase-orders/entities/supplier-price-list.entity';
import { fromCents, toCents } from '../quotations/totals';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);
  constructor(
    private readonly quotations: QuotationsService,
    private readonly rfqs: RfqsService,
    @InjectRepository(ItemStock)
    private readonly itemStocks: Repository<ItemStock>,
    @InjectRepository(SupplierPriceList)
    private readonly priceLists: Repository<SupplierPriceList>,
  ) {}
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

  async generateRfqPdf(id: number): Promise<Buffer> {
    const rfq = await this.rfqs.findOne(id);
    const template = await fs.readFile(
      path.join(__dirname, 'templates', 'rfq.hbs'),
      'utf8',
    );
    const html = Handlebars.compile(template)(rfq);
    return this.renderToPdf(html);
  }

  /**
   * Stock valuation: qty_on_hand × latest known supplier cost by item and
   * location, with per-location and grand totals.
   */
  async stockValuation() {
    const rows: Array<{
      locationId: number;
      locationName: string;
      itemId: number;
      itemCode: string;
      itemDescription: string;
      qtyOnHand: number;
      unitCost: string;
      value: string;
    }> = await this.itemStocks.manager.query(
      `WITH latest_cost AS (
         SELECT DISTINCT ON (spl.item_id) spl.item_id, spl.cost
         FROM supplier_price_lists spl
         ORDER BY spl.item_id, spl.effective_date DESC, spl.id DESC
       )
       SELECT l.id   AS "locationId",
              l.name AS "locationName",
              i.id   AS "itemId",
              i.code AS "itemCode",
              i.description AS "itemDescription",
              SUM(st.qty_on_hand)                        AS "qtyOnHand",
              COALESCE(lc.cost, 0)::numeric              AS "unitCost",
              (SUM(st.qty_on_hand) * COALESCE(lc.cost, 0))::numeric AS "value"
       FROM item_stocks st
       JOIN items i ON i.id = st.item_id
       JOIN locations l ON l.id = st.location_id
       LEFT JOIN latest_cost lc ON lc.item_id = i.id
       WHERE st.qty_on_hand <> 0
       GROUP BY l.id, l.name, i.id, i.code, i.description, lc.cost
       ORDER BY l.name ASC, i.code ASC`,
    );
    const normalized = rows.map((row) => {
      const value = fromCents(Math.round(Number(row.value) * 100));
      return {
        locationId: row.locationId,
        locationName: row.locationName,
        itemId: row.itemId,
        itemCode: row.itemCode,
        itemDescription: row.itemDescription,
        qtyOnHand: Number(row.qtyOnHand),
        unitCost: fromCents(Math.round(Number(row.unitCost) * 100)),
        value,
      };
    });
    const perLocation = new Map<number, { name: string; valueCents: number }>();
    for (const row of normalized) {
      const entry = perLocation.get(row.locationId) ?? {
        name: row.locationName,
        valueCents: 0,
      };
      entry.valueCents += toCents(row.value);
      perLocation.set(row.locationId, entry);
    }
    const byLocation = [...perLocation.entries()].map(
      ([locationId, entry]) => ({
        locationId,
        locationName: entry.name,
        totalValue: fromCents(entry.valueCents),
      }),
    );
    return {
      asOf: new Date().toISOString().slice(0, 10),
      rows: normalized,
      byLocation,
      grandTotal: fromCents(
        normalized.reduce((sum, row) => sum + toCents(row.value), 0),
      ),
    };
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
