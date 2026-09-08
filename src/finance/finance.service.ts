import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Not, Repository } from 'typeorm';
import { Client } from '../clients/entities/client.entity';
import { Item } from '../items/entities/item.entity';
import { InvoiceStatus } from '../common/enums/invoice-status.enum';
import { SalesOrderStatus } from '../common/enums/sales-order-status.enum';
import { NumberingService } from '../common/services/numbering.service';
import {
  computeQuotationTotals,
  fromCents,
  toCents,
} from '../quotations/totals';
import { SalesOrder } from '../sales-orders/entities/sales-order.entity';
import {
  CreateInvoiceFromOrderDto,
  CreateManualInvoiceDto,
} from './dto/create-invoice.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { Invoice } from './entities/invoice.entity';
import { InvoiceLine } from './entities/invoice-line.entity';
import { Payment } from './entities/payment.entity';
import { PaymentAllocation } from './entities/payment-allocation.entity';

export interface AgingRow {
  invoiceId: number;
  invoiceNo: string;
  invoiceDate: string;
  clientName: string | null;
  total: number;
  allocated: number;
  balance: number;
  bucket: '0-30' | '31-60' | '61-90' | '90+';
}

const AGING_BUCKETS = ['0-30', '31-60', '61-90', '90+'] as const;

@Injectable()
export class FinanceService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Invoice) private readonly invoices: Repository<Invoice>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    private readonly numbering: NumberingService,
  ) {}

  /** Create an invoice that snapshots the already-delivered quantities of a Delivered/Closed order. */
  async invoiceFromOrder(dto: CreateInvoiceFromOrderDto, actorId?: number) {
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(SalesOrder, {
        where: { id: dto.salesOrderId },
        relations: ['client', 'lines', 'lines.item'],
      });
      if (!order) throw new NotFoundException('Sales order not found');
      if (
        order.status !== SalesOrderStatus.Delivered &&
        order.status !== SalesOrderStatus.Closed
      ) {
        throw new BadRequestException(
          'Invoices can only be created for Delivered or Closed orders',
        );
      }

      const registrable = order.lines.filter((line) => line.qtyDelivered > 0);
      if (registrable.length === 0)
        throw new BadRequestException(
          'The order has no delivered quantities to invoice',
        );

      const totals = computeQuotationTotals({
        lines: registrable.map((line) => {
          const unitPriceCents = toCents(line.unitPrice);
          const discountCents = toCents(line.discountPercent);
          const lineCents = Math.round(
            (line.qtyDelivered * unitPriceCents * (10000 - discountCents)) /
              10000,
          );
          return { totalPriceAfterDiscount: fromCents(lineCents) };
        }),
        discountGlobalPercent: order.discountGlobal,
        vatPercent: order.vatPercent,
        currency: order.currency,
      });

      const invoice = manager.create(Invoice, {
        invoiceNo: await this.allocateInvoiceNo(manager),
        client: order.client,
        clientName: order.client?.name ?? order.clientName,
        salesOrder: order,
        status: InvoiceStatus.Open,
        currency: totals.currency,
        subtotal: totals.subtotal.toFixed(2),
        discountGlobal: order.discountGlobal,
        vatPercent: order.vatPercent,
        total: totals.grandTotal.toFixed(2),
        createdBy: actorId ? { id: actorId } : null,
      });
      await manager.save(invoice);

      for (const line of registrable) {
        const unitPriceCents = toCents(line.unitPrice);
        const discountCents = toCents(line.discountPercent);
        const lineCents = Math.round(
          (line.qtyDelivered * unitPriceCents * (10000 - discountCents)) /
            10000,
        );
        await manager.save(
          manager.create(InvoiceLine, {
            invoice,
            item: line.item,
            codeSnapshot: line.codeSnapshot,
            descriptionSnapshot: line.descriptionSnapshot,
            qty: line.qtyDelivered,
            unitPrice: line.unitPrice,
            discountPercent: line.discountPercent,
            totalPrice: fromCents(lineCents).toFixed(2),
          }),
        );
      }

      return manager.findOne(Invoice, {
        where: { id: invoice.id },
        relations: ['client', 'salesOrder', 'lines', 'lines.item'],
      });
    });
  }

  /** Manual invoice — negative unit prices produce credit notes. */
  async createManualInvoice(dto: CreateManualInvoiceDto, actorId?: number) {
    return this.dataSource.transaction(async (manager) => {
      let client: Client | null = null;
      if (dto.clientId) {
        client = await manager.findOne(Client, {
          where: { id: dto.clientId },
        });
        if (!client) throw new NotFoundException('Client not found');
      }
      if (!client && !dto.clientName)
        throw new BadRequestException(
          'Provide either clientId or clientName for the invoice',
        );

      const lines: InvoiceLine[] = [];
      for (const entry of dto.lines) {
        let item: Item | null = null;
        let description: string | null = entry.description ?? null;
        let codeSnapshot: string | null = null;
        if (entry.itemCode) {
          item = await manager.findOne(Item, {
            where: { code: entry.itemCode },
          });
          if (!item)
            throw new BadRequestException(
              `Unknown item code '${entry.itemCode}'`,
            );
          codeSnapshot = item.code;
          description = entry.description ?? item.description;
        }
        const unitPriceCents = toCents(entry.unitPrice);
        const discountCents = toCents(entry.discountPercent ?? '0');
        const lineCents =
          Math.round(
            (entry.qty * unitPriceCents * (10000 - discountCents)) / 10000,
          ) * Math.sign(entry.qty);
        lines.push({
          item,
          codeSnapshot,
          descriptionSnapshot: description,
          qty: Math.abs(entry.qty),
          unitPrice: entry.unitPrice ?? '0.00',
          discountPercent: entry.discountPercent ?? '0.00',
          totalPrice: fromCents(lineCents).toFixed(2),
        } as unknown as InvoiceLine);
      }

      const totals = computeQuotationTotals({
        lines: lines.map((line) => ({
          totalPriceAfterDiscount: line.totalPrice,
        })),
        discountGlobalPercent: dto.discountGlobalPercent ?? '0',
        vatPercent: dto.vatPercent ?? '0',
        currency: dto.currency ?? 'USD',
      });

      const invoice = manager.create(Invoice, {
        invoiceNo: await this.allocateInvoiceNo(manager),
        client,
        clientName: client?.name ?? dto.clientName ?? null,
        status: InvoiceStatus.Open,
        currency: totals.currency,
        subtotal: totals.subtotal.toFixed(2),
        discountGlobal: dto.discountGlobalPercent ?? '0',
        vatPercent: dto.vatPercent ?? '0',
        total: totals.grandTotal.toFixed(2),
        notes: dto.notes ?? null,
        invoiceDate: dto.invoiceDate ?? undefined,
        createdBy: actorId ? { id: actorId } : null,
      });
      await manager.save(invoice);

      for (const line of lines) {
        await manager.save(
          manager.create(InvoiceLine, {
            invoice,
            item: line.item,
            codeSnapshot: line.codeSnapshot,
            descriptionSnapshot: line.descriptionSnapshot,
            qty: line.qty,
            unitPrice: line.unitPrice,
            discountPercent: line.discountPercent,
            totalPrice: line.totalPrice,
          }),
        );
      }

      return manager.findOne(Invoice, {
        where: { id: invoice.id },
        relations: ['client', 'salesOrder', 'lines', 'lines.item'],
      });
    });
  }

  /** Record a client payment and allocate it FIFO across the oldest open invoices first. */
  async createPayment(dto: CreatePaymentDto, actorId?: number) {
    return this.dataSource.transaction(async (manager) => {
      const client = await manager.findOne(Client, {
        where: { id: dto.clientId },
      });
      if (!client) throw new NotFoundException('Client not found');
      const amountCents = toCents(dto.amount);
      if (amountCents <= 0)
        throw new BadRequestException('Payment amount must be positive');

      // Lock every open invoice of the client (FIFO: invoice_date, then id) so
      // concurrent payments cannot double-allocate the same balance.
      const openInvoices = await manager.find(Invoice, {
        where: {
          client: { id: client.id },
          status: Not(InvoiceStatus.Cancelled),
        },
        order: { invoiceDate: 'ASC', id: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });

      const allocationRows: Array<{ invoiceId: number; allocated: number }> =
        await manager.query(
          `SELECT pa.invoice_id AS "invoiceId", COALESCE(SUM(pa.amount), 0)::numeric AS "allocated"
           FROM payment_allocations pa
           INNER JOIN invoices i ON i.id = pa.invoice_id AND i.client_id = $1
           GROUP BY pa.invoice_id`,
          [client.id],
        );
      const allocatedByInvoice = new Map<number, number>(
        allocationRows.map((row) => [row.invoiceId, Number(row.allocated)]),
      );

      const allocations: Array<{ invoice: Invoice; cents: number }> = [];
      let remainingCents = amountCents;
      for (const invoice of openInvoices) {
        if (remainingCents <= 0) break;
        const totalCents = toCents(invoice.total);
        const paidCents = Math.round(
          (allocatedByInvoice.get(invoice.id) ?? 0) * 100,
        );
        const balanceCents = totalCents - paidCents;
        if (balanceCents <= 0) continue;
        const take = Math.min(remainingCents, balanceCents);
        allocations.push({ invoice, cents: take });
        remainingCents -= take;
      }

      if (remainingCents > 0)
        throw new UnprocessableEntityException(
          `Payment exceeds the client's open balance (${fromCents(
            amountCents - remainingCents,
          ).toFixed(
            2,
          )} allocatable, ${fromCents(amountCents).toFixed(2)} received)`,
        );

      const payment = manager.create(Payment, {
        paymentNo: await this.allocatePaymentNo(manager),
        client,
        clientName: client.name,
        paymentDate: dto.paymentDate ?? undefined,
        amount: fromCents(amountCents).toFixed(2),
        method: dto.method ?? null,
        referenceNo: dto.referenceNo ?? null,
        notes: dto.notes ?? null,
        createdBy: actorId ? { id: actorId } : null,
      });
      await manager.save(payment);

      const savedAllocations: PaymentAllocation[] = [];
      for (const { invoice, cents } of allocations) {
        const allocation = await manager.save(
          manager.create(PaymentAllocation, {
            payment,
            invoice,
            amount: fromCents(cents).toFixed(2),
          }),
        );
        savedAllocations.push(allocation);
        invoice.status =
          toCents(invoice.total) -
            cents -
            Math.round((allocatedByInvoice.get(invoice.id) ?? 0) * 100) <=
          0
            ? InvoiceStatus.Paid
            : InvoiceStatus.PartiallyPaid;
        await manager.save(invoice);
      }

      const panel: Invoice[] = allocations.map(({ invoice }) => invoice);
      return {
        ...payment,
        allocations: savedAllocations,
        invoices: panel,
      };
    });
  }

  /**
   * AR aging report — one SQL query: every open balance bucketed by age from the
   * invoice date, plus bucket rollups. Rows ordered oldest first.
   */
  async aging() {
    const rows = await this.agingRows();
    const buckets = AGING_BUCKETS.map((bucket) => ({
      bucket,
      total: fromCents(
        rows
          .filter((row) => row.bucket === bucket)
          .reduce((sum, row) => sum + toCents(row.balance), 0),
      ),
    }));
    const grandTotal = fromCents(
      rows.reduce((sum, row) => sum + toCents(row.balance), 0),
    );
    return {
      asOf: new Date().toISOString().slice(0, 10),
      rows,
      buckets,
      grandTotal,
    };
  }

  /** Same aging rows rendered as a CSV document (Balances as of <date>). */
  async agingCsv(): Promise<string> {
    const rows = await this.agingRows();
    const escape = (value: string | number | null): string =>
      `"${String(value ?? '').replace(/"/g, '""')}"`;
    const lines = [
      [
        'invoiceNo',
        'clientName',
        'invoiceDate',
        'total',
        'allocated',
        'balance',
        'bucket',
      ],
      ...rows.map((row) => [
        row.invoiceNo,
        row.clientName,
        row.invoiceDate,
        row.total.toFixed(2),
        row.allocated.toFixed(2),
        row.balance.toFixed(2),
        row.bucket,
      ]),
    ];
    return lines.map((line) => line.map(escape).join(',')).join('\r\n');
  }

  findAll() {
    return this.invoices.find({
      relations: ['client', 'lines'],
      order: { id: 'DESC' },
    });
  }

  async findOne(id: number) {
    const invoice = await this.findOrderInvoice(id);
    const allocatedRows: Array<{ allocated: number }> =
      await this.invoices.manager.query(
        `SELECT COALESCE(SUM(amount), 0)::numeric AS "allocated"
       FROM payment_allocations WHERE invoice_id = $1`,
        [invoice.id],
      );
    return {
      ...invoice,
      allocated: Number(allocatedRows[0]?.allocated ?? 0),
      balance: Math.max(
        0,
        fromCents(
          toCents(invoice.total) -
            Math.round(Number(allocatedRows[0]?.allocated ?? 0) * 100),
        ),
      ),
    };
  }

  listPayments(clientId?: number) {
    return this.payments.find({
      where: clientId ? { client: { id: clientId } } : {},
      relations: ['client', 'allocations', 'allocations.invoice'],
      order: { id: 'DESC' },
    });
  }

  private async findOrderInvoice(id: number) {
    const invoice = await this.invoices.findOne({
      where: { id },
      relations: ['client', 'salesOrder', 'lines', 'lines.item'],
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  private async agingRows(): Promise<AgingRow[]> {
    const rows: Array<{
      invoiceId: number;
      invoiceNo: string;
      invoiceDate: string;
      clientName: string | null;
      total: string;
      allocated: string;
      balance: string;
      bucket: AgingRow['bucket'];
    }> = await this.invoices.manager.query(
      `WITH paid AS (
         SELECT pa.invoice_id, COALESCE(SUM(pa.amount), 0)::numeric AS allocated
         FROM payment_allocations pa
         GROUP BY pa.invoice_id
       )
       SELECT i.id AS "invoiceId",
              i.invoice_no AS "invoiceNo",
              i.invoice_date::text AS "invoiceDate",
              COALESCE(c.name, i.client_name) AS "clientName",
              i.total::numeric AS "total",
              COALESCE(paid.allocated, 0)                AS "allocated",
              (i.total - COALESCE(paid.allocated, 0))::numeric AS "balance",
              CASE
                WHEN (CURRENT_DATE - i.invoice_date) <= 30 THEN '0-30'
                WHEN (CURRENT_DATE - i.invoice_date) <= 60 THEN '31-60'
                WHEN (CURRENT_DATE - i.invoice_date) <= 90 THEN '61-90'
                ELSE '90+'
              END AS "bucket"
       FROM invoices i
       LEFT JOIN clients c ON c.id = i.client_id
       LEFT JOIN paid ON paid.invoice_id = i.id
       WHERE i.status <> 'Cancelled'
         AND (i.total - COALESCE(paid.allocated, 0)) > 0
       ORDER BY i.invoice_date ASC, i.id ASC`,
    );
    return rows.map((row) => ({
      invoiceId: row.invoiceId,
      invoiceNo: row.invoiceNo,
      invoiceDate: row.invoiceDate,
      clientName: row.clientName,
      total: fromCents(toCents(row.total)),
      allocated: fromCents(Math.round(Number(row.allocated) * 100)),
      balance: fromCents(Math.round(Number(row.balance) * 100)),
      bucket: row.bucket,
    }));
  }

  private async allocateInvoiceNo(
    manager: DataSource['manager'],
  ): Promise<string> {
    const year = new Date().getFullYear().toString().slice(-2);
    return this.numbering.next(
      manager,
      `invoice:${year}`,
      (value) => `INV-${year}-${String(value).padStart(4, '0')}`,
      async () => {
        const result: Array<{ max_seq: string | null }> = await manager.query(
          `SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_no FROM 'INV-[0-9]*-([0-9]+)') AS INTEGER)), 0) AS max_seq FROM invoices WHERE invoice_no LIKE $1`,
          [`INV-${year}-%`],
        );
        return Number(result[0]?.max_seq ?? 0);
      },
    );
  }

  private async allocatePaymentNo(
    manager: DataSource['manager'],
  ): Promise<string> {
    const year = new Date().getFullYear().toString().slice(-2);
    return this.numbering.next(
      manager,
      `payment:${year}`,
      (value) => `PAY-${year}-${String(value).padStart(4, '0')}`,
      async () => {
        const result: Array<{ max_seq: string | null }> = await manager.query(
          `SELECT COALESCE(MAX(CAST(SUBSTRING(payment_no FROM 'PAY-[0-9]*-([0-9]+)') AS INTEGER)), 0) AS max_seq FROM payments WHERE payment_no LIKE $1`,
          [`PAY-${year}-%`],
        );
        return Number(result[0]?.max_seq ?? 0);
      },
    );
  }
}
