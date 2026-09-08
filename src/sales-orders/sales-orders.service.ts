import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Client } from '../clients/entities/client.entity';
import { Item } from '../items/entities/item.entity';
import { ItemStock } from '../items/entities/item-stock.entity';
import { Location } from '../locations/entities/location.entity';
import { NumberingService } from '../common/services/numbering.service';
import { QuotationStatus } from '../common/enums/quotation-status.enum';
import { SalesOrderStatus } from '../common/enums/sales-order-status.enum';
import { LocationType } from '../common/enums/location-type.enum';
import { Quotation } from '../quotations/entities/quotation.entity';
import { fromCents, toCents } from '../quotations/totals';
import { Reservation } from '../reservations/entities/reservation.entity';
import { ItemsService } from '../items/items.service';
import {
  deliverFromReservations,
  reserveBestEffort,
  releaseReservation,
  ReserveAllocation,
  snapshotRowsFor,
  StockRowState,
  StockSnapshot,
} from '../transactions/stock-engine';
import { AddSalesOrderLineDto } from './dto/add-line.dto';
import { UpdateSalesOrderLineDto } from './dto/update-line.dto';
import { CreateSalesOrderDto } from './dto/create-sales-order.dto';
import { SalesOrderLine } from './entities/sales-order-line.entity';
import { SalesOrder } from './entities/sales-order.entity';

/** Fixed reservation strategy: showroom first, then storage by id (see re-plan D6). */
function reservationLocationOrder(storageLocations: Location[]): number[] {
  const order = [...storageLocations].sort((a, b) =>
    a.type === LocationType.Showroom
      ? -1
      : b.type === LocationType.Showroom
        ? 1
        : a.id - b.id,
  );
  return order.map((location) => location.id);
}

@Injectable()
export class SalesOrdersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly numbering: NumberingService,
    private readonly itemsService: ItemsService,
    @InjectRepository(SalesOrder)
    private readonly orders: Repository<SalesOrder>,
    @InjectRepository(SalesOrderLine)
    private readonly lines: Repository<SalesOrderLine>,
    @InjectRepository(Quotation)
    private readonly quotations: Repository<Quotation>,
  ) {}

  async create(dto: CreateSalesOrderDto, actorId?: number) {
    return this.dataSource.transaction(async (manager) => {
      const client = dto.clientId
        ? await manager.findOne(Client, {
            where: { id: dto.clientId, isActive: true },
          })
        : null;
      if (dto.clientId && !client)
        throw new NotFoundException('Client not found');
      const orderNo = await this.allocateOrderNo(manager);
      const order = manager.create(SalesOrder, {
        client: client ?? null,
        clientName: client?.name ?? dto.clientName ?? null,
        contactPerson: dto.contactPerson ?? null,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        expectedDeliveryDate: dto.expectedDeliveryDate ?? null,
        discountGlobal: String(dto.discountGlobal ?? 0),
        vatPercent: String(dto.vatPercent ?? 0),
        currency: dto.currency ?? 'USD',
        notes: dto.notes ?? null,
        internalNotes: dto.internalNotes ?? null,
        orderNo,
        status: SalesOrderStatus.Draft,
        createdBy: actorId ? { id: actorId } : null,
      });
      return manager.save(order);
    });
  }

  /** Copies lines from an Approved quotation into a Draft order. One active order per quotation (DB filtered unique index). */
  async createFromQuotation(quotationId: number, actorId?: number) {
    return this.dataSource.transaction(async (manager) => {
      const quotation = await manager.findOne(Quotation, {
        where: { id: quotationId },
        relations: ['details', 'details.item', 'client'],
      });
      if (!quotation) throw new NotFoundException('Quotation not found');
      if (quotation.status !== QuotationStatus.Approved) {
        throw new BadRequestException(
          'Only Approved quotations can become an order',
        );
      }
      const existing = await manager.findOne(SalesOrder, {
        where: {
          quotation: { id: quotationId },
          status: SalesOrderStatus.Draft,
        },
      });
      if (existing) {
        // A Draft order already exists from this quotation — return it instead of duplicating.
        return existing;
      }

      const orderNo = await this.allocateOrderNo(manager);
      const order = await manager.save(
        manager.create(SalesOrder, {
          orderNo,
          client: quotation.client ?? null,
          clientName: quotation.clientName,
          contactPerson: quotation.contactPerson,
          phone: quotation.phone,
          email: quotation.email,
          quotation: { id: quotationId } as Quotation,
          discountGlobal: quotation.discountGlobal,
          vatPercent: quotation.vatPercent,
          currency: quotation.currency,
          status: SalesOrderStatus.Draft,
          createdBy: actorId ? { id: actorId } : null,
        }),
      );

      let sortOrder = 0;
      for (const detail of quotation.details
        .filter((line) => !line.isDeleted)
        .sort((a, b) => a.sortOrder - b.sortOrder)) {
        await manager.save(
          manager.create(SalesOrderLine, {
            salesOrder: order,
            sortOrder: sortOrder++,
            item: detail.item,
            codeSnapshot: detail.codeSnapshot,
            descriptionSnapshot: detail.descriptionSnapshot,
            brandSnapshot: detail.brandSnapshot,
            qty: detail.qty,
            qtyDelivered: 0,
            shortage: false,
            unitPrice: detail.unitPrice,
            currency: quotation.currency,
            discountPercent: detail.discountPercent,
            totalPrice: detail.totalPrice,
            totalPriceAfterDiscount: detail.totalPriceAfterDiscount,
          }),
        );
      }
      return order;
    });
  }

  async addLine(orderId: number, dto: AddSalesOrderLineDto) {
    return this.dataSource.transaction(async (manager) => {
      const order = await this.loadDraft(manager, orderId);
      const item = await this.itemsService.findOne(dto.itemCode);
      const unitPrice = dto.unitPrice ?? Number(item.unitPrice ?? 0);
      const discountPercent = dto.discountPercent ?? 0;
      const totalPrice = dto.qty * unitPrice;
      const totalPriceAfterDiscount =
        totalPrice - (totalPrice * discountPercent) / 100;
      const max = await manager
        .createQueryBuilder(SalesOrderLine, 'line')
        .select('COALESCE(MAX(line.sort_order), -1)', 'max')
        .where('line.sales_order_id = :orderId', { orderId })
        .getRawOne<{ max: string }>();
      return manager.save(
        manager.create(SalesOrderLine, {
          salesOrder: order,
          sortOrder: Number(max?.max ?? -1) + 1,
          item,
          codeSnapshot: item.code,
          descriptionSnapshot: item.description,
          brandSnapshot: item.brand?.name ?? null,
          qty: dto.qty,
          unitPrice: unitPrice.toFixed(2),
          currency: order.currency,
          discountPercent: discountPercent.toFixed(2),
          totalPrice: totalPrice.toFixed(2),
          totalPriceAfterDiscount: totalPriceAfterDiscount.toFixed(2),
          notes: dto.notes ?? null,
        }),
      );
    });
  }

  async updateLine(lineId: number, dto: UpdateSalesOrderLineDto) {
    return this.dataSource.transaction(async (manager) => {
      const line = await manager.findOne(SalesOrderLine, {
        where: { id: lineId },
        relations: ['salesOrder'],
      });
      if (!line) throw new NotFoundException('Order line not found');
      if (line.salesOrder.status !== SalesOrderStatus.Draft)
        throw new BadRequestException(
          'Lines can only be changed on Draft orders',
        );
      let item = line.item;
      if (dto.itemCode) {
        item = await this.itemsService.findOne(dto.itemCode);
        line.item = item;
        line.codeSnapshot = item.code;
        line.descriptionSnapshot = item.description;
        line.brandSnapshot = item.brand?.name ?? null;
      }
      const qty = dto.qty ?? line.qty;
      const unitPrice = dto.unitPrice ?? Number(line.unitPrice);
      const discountPercent =
        dto.discountPercent ?? Number(line.discountPercent);
      const totalPrice = qty * unitPrice;
      const totalPriceAfterDiscount =
        totalPrice - (totalPrice * discountPercent) / 100;
      Object.assign(line, {
        qty,
        unitPrice: unitPrice.toFixed(2),
        discountPercent: discountPercent.toFixed(2),
        totalPrice: totalPrice.toFixed(2),
        totalPriceAfterDiscount: totalPriceAfterDiscount.toFixed(2),
        notes: dto.notes ?? line.notes,
      });
      return manager.save(line);
    });
  }

  async removeLine(lineId: number) {
    return this.dataSource.transaction(async (manager) => {
      const line = await manager.findOne(SalesOrderLine, {
        where: { id: lineId },
        relations: ['salesOrder'],
      });
      if (!line) throw new NotFoundException('Order line not found');
      if (line.salesOrder.status !== SalesOrderStatus.Draft)
        throw new BadRequestException(
          'Lines can only be removed on Draft orders',
        );
      await manager.remove(line);
      return { id: lineId };
    });
  }

  /**
   * Confirm: in one transaction, lock the item_stocks rows for every ordered
   * item (ordered by id — the established deadlock rule), reserve best-effort
   * showroom-first, write reservation rows, flag shortages per line, and flip
   * status to Confirmed. Marks the source quotation Converted.
   */
  async confirm(id: number) {
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(SalesOrder, {
        where: { id },
        relations: ['lines', 'lines.item'],
      });
      if (!order) throw new NotFoundException('Sales order not found');
      if (order.status !== SalesOrderStatus.Draft)
        throw new BadRequestException('Only Draft orders can be confirmed');

      const physicalLocations = await manager.find(Location, {
        where: { isPhysical: true },
      });
      const locationOrder = reservationLocationOrder(physicalLocations);

      // Lock stock rows for all ordered items, ordered by location id (deadlock rule).
      const itemIds = [
        ...new Set(
          order.lines.filter((line) => line.item).map((line) => line.item!.id),
        ),
      ];
      const stockRows =
        itemIds.length > 0
          ? await manager
              .createQueryBuilder(ItemStock, 'stock')
              .setLock('pessimistic_write')
              .where('stock.item_id IN (:...itemIds)', { itemIds })
              .orderBy('stock.location_id', 'ASC')
              .getMany()
          : [];

      const rowsByItem = new Map<number, StockRowState[]>();
      for (const row of stockRows) {
        if (!rowsByItem.has(row.item.id)) rowsByItem.set(row.item.id, []);
        rowsByItem.get(row.item.id)!.push({
          locationId: row.location.id,
          qtyOnHand: row.qtyOnHand,
          qtyReserved: row.qtyReserved,
        });
      }

      const allocationsByLine = new Map<number, ReserveAllocation[]>();

      for (const line of order.lines) {
        if (!line.item) continue;
        const rows = rowsByItem.get(line.item.id) ?? [];
        const { allocations, short } = reserveBestEffort(
          rows,
          line.qty,
          locationOrder,
        );
        if (short > 0) {
          line.shortage = true;
        }
        allocationsByLine.set(line.id, allocations);
      }

      // Persist the mutated stock rows.
      const stockEntitiesByKey = new Map(
        stockRows.map((row) => [`${row.item.id}:${row.location.id}`, row]),
      );
      for (const [itemId, rows] of rowsByItem) {
        for (const row of rows) {
          const entity = stockEntitiesByKey.get(`${itemId}:${row.locationId}`);
          if (!entity) continue;
          entity.qtyOnHand = row.qtyOnHand;
          entity.qtyReserved = row.qtyReserved;
          await manager.save(entity);
        }
      }

      // Persist reservations (aggregated per item+location so the unique
      // constraint is never hit by two lines carrying the same item).
      const reservationsByKey = new Map<
        string,
        { item: Item; locationId: number; qty: number }
      >();
      for (const line of order.lines) {
        const allocations = allocationsByLine.get(line.id) ?? [];
        for (const allocation of allocations) {
          const key = `${line.item!.id}:${allocation.locationId}`;
          const existing = reservationsByKey.get(key);
          if (existing) existing.qty += allocation.qty;
          else
            reservationsByKey.set(key, {
              item: line.item!,
              locationId: allocation.locationId,
              qty: allocation.qty,
            });
        }
        await manager.save(line);
      }
      for (const reservation of reservationsByKey.values()) {
        await manager.save(
          manager.create(Reservation, {
            salesOrder: order,
            item: reservation.item,
            location: { id: reservation.locationId } as Location,
            qty: reservation.qty,
          }),
        );
      }

      order.status = SalesOrderStatus.Confirmed;
      await manager.save(order);

      // Mark source quotation Converted.
      if (order.quotation) {
        const quotation = await manager.findOne(Quotation, {
          where: { id: order.quotation.id },
        });
        if (quotation && quotation.status === QuotationStatus.Approved) {
          quotation.status = QuotationStatus.Converted;
          await manager.save(quotation);
        }
      }

      return manager.findOne(SalesOrder, {
        where: { id },
        relations: ['lines'],
      });
    });
  }

  /** Cancel a confirmed order: release all reservations (on-hand untouched). */
  async cancel(id: number) {
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(SalesOrder, {
        where: { id },
        relations: ['lines', 'lines.item', 'reservations'],
      });
      if (!order) throw new NotFoundException('Sales order not found');
      if (order.status === SalesOrderStatus.Cancelled) return order;
      if (
        order.status !== SalesOrderStatus.Confirmed &&
        order.status !== SalesOrderStatus.Draft
      ) {
        throw new BadRequestException(
          'Only Draft or Confirmed orders can be cancelled',
        );
      }

      // Reverse reservations best-effort: group by item+location and release.
      const reservations = await manager.find(Reservation, {
        where: { salesOrder: { id } },
        relations: ['item', 'location'],
      });
      if (reservations.length > 0) {
        const itemIds = [
          ...new Set(reservations.map((reservation) => reservation.item.id)),
        ];
        const stockRows = await manager
          .createQueryBuilder(ItemStock, 'stock')
          .setLock('pessimistic_write')
          .where('stock.item_id IN (:...itemIds)', { itemIds })
          .orderBy('stock.location_id', 'ASC')
          .getMany();
        const rowsByKey = new Map(
          stockRows.map((row) => [`${row.item.id}:${row.location.id}`, row]),
        );

        for (const reservation of reservations) {
          const key = `${reservation.item.id}:${reservation.location.id}`;
          const row = rowsByKey.get(key);
          if (!row) continue;
          const state: StockRowState = {
            locationId: row.location.id,
            qtyOnHand: row.qtyOnHand,
            qtyReserved: row.qtyReserved,
          };
          releaseReservation(
            [state],
            [{ locationId: row.location.id, qty: reservation.qty }],
          );
          row.qtyOnHand = state.qtyOnHand;
          row.qtyReserved = state.qtyReserved;
          await manager.save(row);
        }
        await manager.remove(reservations);
      }

      order.status = SalesOrderStatus.Cancelled;
      return manager.save(order);
    });
  }

  /**
   * Sale recorded against a confirmed order: consumes the order's reserved
   * quantity for the item (deliverFromReservations: reserved first, then
   * unreserved availability so shortage lines can be fulfilled), trims the
   * reservation rows, bumps line.qtyDelivered and auto-closes on full delivery.
   * Returns before/after stock snapshots for the item's locations.
   */
  async consumeReservedForOrder(
    manager: DataSource['manager'],
    orderId: number,
    itemId: number,
    qty: number,
  ): Promise<{ before: StockSnapshot; after: StockSnapshot }> {
    const order = await manager.findOne(SalesOrder, {
      where: { id: orderId },
      lock: { mode: 'pessimistic_write' },
      relations: ['lines', 'lines.item'],
    });
    if (!order) throw new NotFoundException('Sales order not found');
    if (
      order.status !== SalesOrderStatus.Confirmed &&
      order.status !== SalesOrderStatus.Delivered
    ) {
      throw new BadRequestException(
        'Only Confirmed or Delivered orders can be sold against',
      );
    }

    const line = order.lines.find((candidate) => candidate.item?.id === itemId);
    if (!line) throw new NotFoundException('Order has no line for this item');
    const remaining = line.qty - line.qtyDelivered;
    if (qty > remaining)
      throw new BadRequestException(
        `Sale exceeds outstanding order quantity (remaining ${remaining}, requested ${qty})`,
      );

    const reservations = await manager.find(Reservation, {
      where: { salesOrder: { id: orderId }, item: { id: itemId } },
      relations: ['location'],
      order: { location: { id: 'ASC' } },
    });

    const stockRows = await manager
      .createQueryBuilder(ItemStock, 'stock')
      .setLock('pessimistic_write')
      .leftJoinAndSelect('stock.location', 'location')
      .where('stock.item_id = :itemId', { itemId })
      .orderBy('stock.location_id', 'ASC')
      .getMany();
    const states: StockRowState[] = stockRows.map((row) => ({
      locationId: row.location.id,
      qtyOnHand: row.qtyOnHand,
      qtyReserved: row.qtyReserved,
    }));
    const before = snapshotRowsFor(
      states,
      stockRows.map((row) => row.location.id),
    );

    deliverFromReservations(
      states,
      reservations.map((reservation) => ({
        locationId: reservation.location.id,
        qty: reservation.qty,
      })),
      qty,
    );

    const rowsByKey = new Map(stockRows.map((row) => [row.location.id, row]));
    for (const state of states) {
      const entity = rowsByKey.get(state.locationId);
      if (!entity) continue;
      entity.qtyOnHand = state.qtyOnHand;
      entity.qtyReserved = state.qtyReserved;
      await manager.save(entity);
    }

    // Trim the reservation rows consumed by this sale.
    let toConsume = qty;
    for (const reservation of reservations) {
      if (toConsume <= 0) break;
      const take = Math.min(reservation.qty, toConsume);
      reservation.qty -= take;
      toConsume -= take;
      if (reservation.qty <= 0) await manager.remove(reservation);
      else await manager.save(reservation);
    }

    line.qtyDelivered += qty;
    await manager.save(line);

    const allDelivered =
      order.lines.length > 0 &&
      order.lines.every((candidate) => candidate.qty <= candidate.qtyDelivered);
    order.status = allDelivered
      ? SalesOrderStatus.Closed
      : SalesOrderStatus.Delivered;
    await manager.save(order);

    return {
      before,
      after: snapshotRowsFor(
        states,
        stockRows.map((row) => row.location.id),
      ),
    };
  }

  findAll() {
    return this.orders.find({
      relations: ['client', 'lines'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number) {
    const order = await this.orders.findOne({
      where: { id },
      relations: [
        'client',
        'quotation',
        'lines',
        'lines.item',
        'reservations',
        'reservations.location',
        'deliveries',
      ],
    });
    if (!order) throw new NotFoundException('Sales order not found');
    order.lines.sort((a, b) => a.sortOrder - b.sortOrder);
    const margin = await this.computeMargin(order.lines, this.orders.manager);
    return { ...order, margin };
  }

  /**
   * Order margin: revenue (sum of line totals after line discount) minus the
   * cost of the sold quantities valued at the latest known supplier cost per
   * item (falling back to 0 when no price list exists yet). No item_costs table
   * is maintained in Phase 4 — costs are read at request time.
   */
  private async computeMargin(
    lines: SalesOrderLine[],
    manager: DataSource['manager'],
  ): Promise<{ revenue: number; cost: number; margin: number } | null> {
    if (lines.length === 0) return null;
    const itemIds = [...new Set(lines.map((line) => line.item?.id))].filter(
      (id): id is number => typeof id === 'number',
    );
    const costById = new Map<number, number>();
    if (itemIds.length > 0) {
      const rows: Array<{ itemId: number; cost: string }> = await manager.query(
        `WITH latest_cost AS (
           SELECT DISTINCT ON (spl.item_id) spl.item_id, spl.cost
           FROM supplier_price_lists spl
           WHERE spl.item_id = ANY($1::int[])
           ORDER BY spl.item_id, spl.effective_date DESC, spl.id DESC
         )
         SELECT item_id AS "itemId", cost FROM latest_cost`,
        [itemIds],
      );
      for (const row of rows) costById.set(row.itemId, Number(row.cost));
    }
    const revenue = Math.round(
      lines.reduce(
        (sum, line) => sum + toCents(line.totalPriceAfterDiscount),
        0,
      ),
    );
    const cost = Math.round(
      lines.reduce(
        (sum, line) =>
          sum +
          Math.round(line.qty * (costById.get(line.item?.id ?? -1) ?? 0) * 100),
        0,
      ),
    );
    return {
      revenue: fromCents(revenue),
      cost: fromCents(cost),
      margin: fromCents(revenue - cost),
    };
  }

  private async allocateOrderNo(
    manager: DataSource['manager'],
  ): Promise<string> {
    const year = new Date().getFullYear().toString().slice(-2);
    return this.numbering.next(
      manager,
      `sales-order:${year}`,
      (value) => `SO-${year}-${String(value).padStart(4, '0')}`,
      async () => {
        const result: Array<{ max_seq: string | null }> = await manager.query(
          `SELECT COALESCE(MAX(CAST(SUBSTRING(order_no FROM 'SO-[0-9]*-([0-9]+)') AS INTEGER)), 0) AS max_seq FROM sales_orders WHERE order_no LIKE $1`,
          [`SO-${year}-%`],
        );
        return Number(result[0]?.max_seq ?? 0);
      },
    );
  }

  private async loadDraft(
    manager: DataSource['manager'],
    orderId: number,
  ): Promise<SalesOrder> {
    const order = await manager.findOne(SalesOrder, { where: { id: orderId } });
    if (!order) throw new NotFoundException('Sales order not found');
    if (order.status !== SalesOrderStatus.Draft)
      throw new BadRequestException(
        'Lines can only be changed while the order is a Draft',
      );
    return order;
  }
}
