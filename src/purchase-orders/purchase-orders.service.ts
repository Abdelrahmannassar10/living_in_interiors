import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { NumberingService } from '../common/services/numbering.service';
import {
  AdjustmentReason,
  AdjustmentType,
} from '../common/enums/transaction-type.enum';
import { PurchaseOrderStatus } from '../common/enums/purchase-order-status.enum';
import { Item } from '../items/entities/item.entity';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { TransactionsService } from '../transactions/transactions.service';
import { Transaction } from '../transactions/entities/transaction.entity';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { PurchaseOrderLine } from './entities/purchase-order-line.entity';
import { GoodsReceipt } from './entities/goods-receipt.entity';
import { GoodsReceiptLine } from './entities/goods-receipt-line.entity';
import { SupplierPriceList } from './entities/supplier-price-list.entity';
import { CreateFromSuggestionsDto } from './dto/create-from-suggestions.dto';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { ReceiveGoodsDto } from './dto/receive-goods.dto';
import { ReturnToSupplierDto } from './dto/return-to-supplier.dto';

export interface SuggestionRow {
  itemId: number;
  itemCode: string;
  itemDescription: string | null;
  lowStockThreshold: number;
  available: number;
  suggestedQty: number;
  supplierId: number | null;
  supplierName: string | null;
  unitCost: string | null;
}

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly numbering: NumberingService,
    private readonly transactions: TransactionsService,
    @InjectRepository(PurchaseOrder)
    private readonly orders: Repository<PurchaseOrder>,
    @InjectRepository(GoodsReceipt)
    private readonly receipts: Repository<GoodsReceipt>,
  ) {}

  create(
    dto: CreatePurchaseOrderDto,
    actorId?: number,
  ): Promise<PurchaseOrder> {
    return this.dataSource.transaction(async (manager) => {
      const supplier = await manager.findOne(Supplier, {
        where: { id: dto.supplierId, isActive: true },
      });
      if (!supplier) throw new NotFoundException('Supplier not found');

      const purchaseNo = await this.allocatePurchaseNo(manager);
      const order = manager.create(PurchaseOrder, {
        purchaseNo,
        supplier: { id: supplier.id },
        expectedDate: dto.expectedDate ?? null,
        currency: dto.currency?.toUpperCase() ?? 'USD',
        notes: dto.notes ?? null,
        status: PurchaseOrderStatus.Draft,
        createdBy: actorId ? { id: actorId } : null,
      });
      await manager.save(order);

      const lines: PurchaseOrderLine[] = [];
      const seenCodes = new Set<string>();
      for (const line of dto.lines) {
        const code = line.itemCode.toUpperCase();
        if (seenCodes.has(code))
          throw new BadRequestException(`Duplicate line for item ${code}`);
        seenCodes.add(code);
        const item = await manager.findOne(Item, {
          where: { code, isActive: true },
        });
        if (!item) throw new NotFoundException(`Item ${code} not found`);
        lines.push(
          manager.create(PurchaseOrderLine, {
            purchaseOrder: order,
            item: { id: item.id },
            qty: line.qty,
            receivedQty: 0,
            unitCost:
              line.unitCost !== undefined ? String(line.unitCost) : null,
          }),
        );
      }
      await manager.save(lines);
      return (await this.loadOrder(manager, order.id))!;
    });
  }

  createFromSuggestions(
    dto: CreateFromSuggestionsDto,
    actorId?: number,
  ): Promise<PurchaseOrder[]> {
    return this.dataSource.transaction(async (manager) => {
      let rows = await this.alertingRows(manager, dto.itemIds);
      if (dto.supplierId)
        rows = rows.filter((row) => row.supplierId === dto.supplierId);
      if (rows.length === 0)
        throw new BadRequestException('No stock-low items to reorder');

      const grouped = new Map<number, SuggestionRow[]>();
      for (const row of rows) {
        if (!row.supplierId) continue;
        const group = grouped.get(row.supplierId) ?? [];
        group.push(row);
        grouped.set(row.supplierId, group);
      }
      if (grouped.size === 0)
        throw new BadRequestException(
          'None of the stock-low items have an assigned supplier',
        );

      const created: PurchaseOrder[] = [];
      for (const [supplierId, group] of grouped) {
        const purchaseNo = await this.allocatePurchaseNo(manager);
        const order = manager.create(PurchaseOrder, {
          purchaseNo,
          supplier: { id: supplierId },
          expectedDate: dto.expectedDate ?? null,
          currency: 'USD',
          notes: dto.notes ?? null,
          status: PurchaseOrderStatus.Draft,
          createdBy: actorId ? { id: actorId } : null,
        });
        await manager.save(order);
        const lines = group.map((row) =>
          manager.create(PurchaseOrderLine, {
            purchaseOrder: order,
            item: { id: row.itemId },
            qty: row.suggestedQty,
            receivedQty: 0,
            unitCost: row.unitCost ?? '0',
          }),
        );
        await manager.save(lines);
        created.push((await this.loadOrder(manager, order.id))!);
      }
      return created;
    });
  }

  suggestions(): Promise<SuggestionRow[]> {
    return this.dataSource.transaction(async (manager) =>
      this.alertingRows(manager),
    );
  }

  send(id: number): Promise<PurchaseOrder> {
    return this.transition(
      id,
      [PurchaseOrderStatus.Draft],
      PurchaseOrderStatus.Sent,
    );
  }

  cancel(id: number): Promise<PurchaseOrder> {
    return this.transition(
      id,
      [
        PurchaseOrderStatus.Draft,
        PurchaseOrderStatus.Sent,
        PurchaseOrderStatus.PartiallyReceived,
      ],
      PurchaseOrderStatus.Cancelled,
    );
  }

  close(id: number): Promise<PurchaseOrder> {
    return this.transition(
      id,
      [PurchaseOrderStatus.Received],
      PurchaseOrderStatus.Closed,
    );
  }

  receiveGoods(
    id: number,
    dto: ReceiveGoodsDto,
    actorId?: number,
  ): Promise<GoodsReceipt> {
    return this.dataSource
      .transaction((manager) => this.receiveWithin(manager, id, dto, actorId))
      .then(async (result) => {
        for (const transaction of result.effects)
          await this.transactions.runPostCommitEffects(transaction);
        return result.receipt;
      });
  }

  returnToSupplier(
    id: number,
    dto: ReturnToSupplierDto,
    actorId?: number,
  ): Promise<PurchaseOrder> {
    return this.dataSource
      .transaction((manager) => this.returnWithin(manager, id, dto, actorId))
      .then(async (result) => {
        for (const transaction of result.effects)
          await this.transactions.runPostCommitEffects(transaction);
        return result.order;
      });
  }

  findAll(): Promise<PurchaseOrder[]> {
    return this.orders.find({
      relations: ['supplier', 'lines', 'lines.item'],
      order: { id: 'DESC' },
    });
  }

  async findOne(id: number): Promise<PurchaseOrder> {
    const order = await this.orders.findOne({
      where: { id },
      relations: [
        'supplier',
        'lines',
        'lines.item',
        'receipts',
        'receipts.lines',
        'receipts.lines.item',
      ],
    });
    if (!order) throw new NotFoundException('Purchase order not found');
    order.lines.sort((a, b) => a.id - b.id);
    return order;
  }

  listReceipts(): Promise<GoodsReceipt[]> {
    return this.receipts.find({
      relations: [
        'purchaseOrder',
        'purchaseOrder.supplier',
        'lines',
        'lines.item',
      ],
      order: { id: 'DESC' },
    });
  }

  private async receiveWithin(
    manager: EntityManager,
    id: number,
    dto: ReceiveGoodsDto,
    actorId?: number,
  ): Promise<{ receipt: GoodsReceipt; effects: Transaction[] }> {
    const order = await this.loadLocked(manager, id);
    if (
      order.status !== PurchaseOrderStatus.Sent &&
      order.status !== PurchaseOrderStatus.PartiallyReceived
    )
      throw new BadRequestException(
        `Goods can only be received on a Sent or PartiallyReceived purchase order (currently ${order.status})`,
      );

    const requested = this.aggregate(dto.lines);
    for (const line of order.lines) {
      const qty = requested.get(line.id) ?? 0;
      if (qty === 0) continue;
      const remaining = line.qty - line.receivedQty;
      if (qty > remaining)
        throw new BadRequestException(
          `Cannot receive ${qty} of ${line.item.code}: only ${remaining} unit(s) remain on the purchase order`,
        );
    }

    const receiptNo = await this.allocateReceiptNo(manager);
    const receipt = manager.create(GoodsReceipt, {
      receiptNo,
      purchaseOrder: { id: order.id },
      receivedAt: dto.receivedAt ?? this.today(),
      notes: dto.notes ?? null,
      createdBy: actorId ? { id: actorId } : null,
    });
    await manager.save(receipt);

    const effects: Transaction[] = [];
    for (const line of order.lines) {
      const qty = requested.get(line.id) ?? 0;
      if (qty === 0) continue;
      const toLocationId = dto.lines.find(
        (l) => l.lineId === line.id,
      )!.toLocationId;
      const created = await this.transactions.recordInternalAdjustment(
        manager,
        {
          itemCode: line.item.code,
          qty,
          adjustmentType: AdjustmentType.Increase,
          adjustmentReason: AdjustmentReason.NewArrival,
          locationId: toLocationId,
          purchaseOrderId: order.id,
          notes: `Goods receipt ${receiptNo}`,
          actorId,
        },
      );
      effects.push(created);
      line.receivedQty += qty;
      await manager.save(
        manager.create(GoodsReceiptLine, {
          goodsReceipt: receipt,
          item: { id: line.item.id },
          qty,
          unitCost: line.unitCost ?? '0',
        }),
      );
      await this.ensurePriceList(
        manager,
        order,
        line.item.id,
        line.unitCost,
        dto.receivedAt,
      );
    }

    await manager.save(order.lines);
    const allReceived = order.lines.every(
      (line) => line.receivedQty >= line.qty,
    );
    order.status = allReceived
      ? PurchaseOrderStatus.Received
      : PurchaseOrderStatus.PartiallyReceived;
    await manager.save(order);

    const saved = await manager.findOne(GoodsReceipt, {
      where: { id: receipt.id },
      relations: [
        'purchaseOrder',
        'purchaseOrder.supplier',
        'lines',
        'lines.item',
      ],
    });
    return { receipt: saved!, effects };
  }

  private async returnWithin(
    manager: EntityManager,
    id: number,
    dto: ReturnToSupplierDto,
    actorId?: number,
  ): Promise<{ order: PurchaseOrder; effects: Transaction[] }> {
    const order = await this.loadLocked(manager, id);
    if (
      order.status !== PurchaseOrderStatus.Sent &&
      order.status !== PurchaseOrderStatus.PartiallyReceived &&
      order.status !== PurchaseOrderStatus.Received
    )
      throw new BadRequestException(
        `Supplier returns are only allowed on a Sent, PartiallyReceived or Received purchase order (currently ${order.status})`,
      );

    const requested = this.aggregate(dto.lines);
    for (const line of order.lines) {
      const qty = requested.get(line.id) ?? 0;
      if (qty === 0) continue;
      if (qty > line.receivedQty)
        throw new BadRequestException(
          `Cannot return ${qty} of ${line.item.code}: only ${line.receivedQty} unit(s) were received`,
        );
    }

    const effects: Transaction[] = [];
    for (const line of order.lines) {
      const qty = requested.get(line.id) ?? 0;
      if (qty === 0) continue;
      const fromLocationId = dto.lines.find(
        (l) => l.lineId === line.id,
      )!.fromLocationId;
      effects.push(
        await this.transactions.recordInternalAdjustment(manager, {
          itemCode: line.item.code,
          qty,
          adjustmentType: AdjustmentType.Decrease,
          adjustmentReason: AdjustmentReason.SupplierReturn,
          locationId: fromLocationId,
          purchaseOrderId: order.id,
          notes: `Return to supplier (${order.purchaseNo})`,
          actorId,
        }),
      );
    }
    return { order, effects };
  }

  private async ensurePriceList(
    manager: EntityManager,
    order: PurchaseOrder,
    itemId: number,
    unitCost: string | null,
    receivedAt?: string,
  ): Promise<void> {
    if (!order.supplier) return;
    const existing = await manager.findOne(SupplierPriceList, {
      where: { supplier: { id: order.supplier.id }, item: { id: itemId } },
    });
    if (existing) return;
    await manager.save(
      manager.create(SupplierPriceList, {
        supplier: { id: order.supplier.id },
        item: { id: itemId },
        cost: unitCost ?? '0',
        effectiveDate: receivedAt ?? this.today(),
      }),
    );
  }

  private async alertingRows(
    manager: EntityManager,
    itemIds?: number[],
  ): Promise<SuggestionRow[]> {
    const params: unknown[] = [];
    let itemFilter = '';
    if (itemIds) {
      params.push(itemIds);
      itemFilter = 'AND i.id = ANY($1)';
    }
    const rows: Array<{
      itemId: number;
      itemCode: string;
      itemDescription: string | null;
      lowStockThreshold: number;
      available: number;
      supplierId: number | null;
      supplierName: string | null;
      unitCost: string | null;
    }> = await manager.query(
      `
      SELECT
        i.id AS "itemId",
        i.code AS "itemCode",
        i.description AS "itemDescription",
        i.low_stock_threshold AS "lowStockThreshold",
        COALESCE(av.available, 0) AS "available",
        s.id AS "supplierId",
        s.name AS "supplierName",
        spl.cost AS "unitCost"
      FROM items i
      LEFT JOIN (
        SELECT st.item_id,
               SUM(st.qty_on_hand) - SUM(st.qty_reserved) AS available
        FROM item_stocks st
        GROUP BY st.item_id
      ) av ON av.item_id = i.id
      LEFT JOIN suppliers s ON s.brand_id = i.brand_id
      LEFT JOIN LATERAL (
        SELECT cost FROM supplier_price_lists spl
        WHERE spl.item_id = i.id
        ORDER BY spl.effective_date DESC, spl.id DESC
        LIMIT 1
      ) spl ON true
      WHERE i.is_active = true
        AND COALESCE(av.available, 0) <= i.low_stock_threshold
        ${itemFilter}
      ORDER BY i.code ASC
      `,
      params,
    );
    return rows.map((row) => ({ ...row, suggestedQty: row.lowStockThreshold }));
  }

  private async transition(
    id: number,
    allowed: PurchaseOrderStatus[],
    next: PurchaseOrderStatus,
  ): Promise<PurchaseOrder> {
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(PurchaseOrder, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new NotFoundException('Purchase order not found');
      if (!allowed.includes(order.status))
        throw new BadRequestException(
          `Cannot move a ${order.status} purchase order to ${next}`,
        );
      order.status = next;
      await manager.save(order);
      return (await this.loadOrder(manager, id))!;
    });
  }

  private aggregate(
    lines: Array<{ lineId: number; qty: number }>,
  ): Map<number, number> {
    const map = new Map<number, number>();
    for (const line of lines)
      map.set(line.lineId, (map.get(line.lineId) ?? 0) + line.qty);
    return map;
  }

  private async loadLocked(
    manager: EntityManager,
    id: number,
  ): Promise<PurchaseOrder> {
    const order = await manager.findOne(PurchaseOrder, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
      relations: ['lines', 'lines.item', 'supplier'],
    });
    if (!order) throw new NotFoundException('Purchase order not found');
    return order;
  }

  private loadOrder(
    manager: EntityManager,
    id: number,
  ): Promise<PurchaseOrder | null> {
    return manager.findOne(PurchaseOrder, {
      where: { id },
      relations: ['supplier', 'lines', 'lines.item'],
    });
  }

  private allocatePurchaseNo(manager: EntityManager): Promise<string> {
    const year = new Date().getFullYear().toString().slice(-2);
    return this.numbering.next(
      manager,
      `purchase-order:${year}`,
      (value) => `PO-${year}-${String(value).padStart(4, '0')}`,
      async () => {
        const result: Array<{ max_seq: string | null }> = await manager.query(
          `SELECT COALESCE(MAX(CAST(SUBSTRING(purchase_no FROM 'PO-[0-9]*-([0-9]+)') AS INTEGER)), 0) AS max_seq FROM purchase_orders WHERE purchase_no LIKE $1`,
          [`PO-${year}-%`],
        );
        return Number(result[0]?.max_seq ?? 0);
      },
    );
  }

  private allocateReceiptNo(manager: EntityManager): Promise<string> {
    const year = new Date().getFullYear().toString().slice(-2);
    return this.numbering.next(
      manager,
      `goods-receipt:${year}`,
      (value) => `GR-${year}-${String(value).padStart(4, '0')}`,
      async () => {
        const result: Array<{ max_seq: string | null }> = await manager.query(
          `SELECT COALESCE(MAX(CAST(SUBSTRING(receipt_no FROM 'GR-[0-9]*-([0-9]+)') AS INTEGER)), 0) AS max_seq FROM goods_receipts WHERE receipt_no LIKE $1`,
          [`GR-${year}-%`],
        );
        return Number(result[0]?.max_seq ?? 0);
      },
    );
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
