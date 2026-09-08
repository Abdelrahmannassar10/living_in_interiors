import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ItemStock } from '../items/entities/item-stock.entity';
import { NumberingService } from '../common/services/numbering.service';
import { SalesOrderStatus } from '../common/enums/sales-order-status.enum';
import { SalesOrderLine } from '../sales-orders/entities/sales-order-line.entity';
import { SalesOrder } from '../sales-orders/entities/sales-order.entity';
import { Reservation } from '../reservations/entities/reservation.entity';
import {
  deliverFromReservations,
  ReserveAllocation,
  StockRowState,
} from '../transactions/stock-engine';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { DeliveryLine } from './entities/delivery-line.entity';
import { Delivery } from './entities/delivery.entity';

@Injectable()
export class DeliveriesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly numbering: NumberingService,
    @InjectRepository(Delivery)
    private readonly deliveries: Repository<Delivery>,
  ) {}

  async create(orderId: number, dto: CreateDeliveryDto, actorId?: number) {
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(SalesOrder, {
        where: { id: orderId },
        relations: ['lines', 'lines.item'],
      });
      if (!order) throw new NotFoundException('Sales order not found');
      if (
        order.status !== SalesOrderStatus.Confirmed &&
        order.status !== SalesOrderStatus.Delivered
      ) {
        throw new BadRequestException(
          'Only Confirmed or Delivered orders can be delivered against',
        );
      }
      if (dto.lines.length === 0)
        throw new BadRequestException('Delivery requires at least one line');

      const lineById = new Map(
        order.lines.filter((line) => line.item).map((line) => [line.id, line]),
      );

      // Aggregate requested quantity per sales-order line.
      const requested = new Map<number, number>();
      for (const requestedLine of dto.lines) {
        const line = lineById.get(requestedLine.salesOrderLineId);
        if (!line)
          throw new BadRequestException(
            `Sales order line ${requestedLine.salesOrderLineId} not found or has no item`,
          );
        const remaining = line.qty - line.qtyDelivered;
        if (requestedLine.qty > remaining) {
          throw new BadRequestException(
            `Line ${line.id} over-delivery: remaining ${remaining}, requested ${requestedLine.qty}`,
          );
        }
        requested.set(
          line.id,
          (requested.get(line.id) ?? 0) + requestedLine.qty,
        );
      }

      // Re-validate the aggregated quantity (duplicate DTO entries for the
      // same line must not bypass the over-delivery cap).
      for (const [lineId, qty] of requested) {
        const line = lineById.get(lineId)!;
        const remaining = line.qty - line.qtyDelivered;
        if (qty > remaining) {
          throw new BadRequestException(
            `Line ${lineId} over-delivery after aggregation: remaining ${remaining}, requested ${qty}`,
          );
        }
      }

      // For each item, lock its stock rows (ordered by location id — deadlock rule),
      // derive reservation allocations, and consume the requested quantity.
      const deliveryNo = await this.allocateDeliveryNo(manager);
      const delivery = await manager.save(
        manager.create(Delivery, {
          deliveryNo,
          salesOrder: order,
          deliveredAt: dto.deliveredAt ?? new Date().toISOString().slice(0, 10),
          notes: dto.notes ?? null,
          createdBy: actorId ? { id: actorId } : null,
        }),
      );

      const stockRowsByItem = new Map<number, ItemStock[]>();
      for (const lineId of requested.keys()) {
        const line = lineById.get(lineId)!;
        if (!stockRowsByItem.has(line.item!.id)) {
          const rows = await manager
            .createQueryBuilder(ItemStock, 'stock')
            .setLock('pessimistic_write')
            .where('stock.item_id = :itemId', { itemId: line.item!.id })
            .orderBy('stock.location_id', 'ASC')
            .getMany();
          stockRowsByItem.set(line.item!.id, rows);
        }
      }

      for (const [lineId, qty] of requested) {
        const line = lineById.get(lineId)!;
        const allocations = await this.reservationsForLine(
          manager,
          order.id,
          line.item!.id,
        );
        const rows = stockRowsByItem.get(line.item!.id) ?? [];
        const states: StockRowState[] = rows.map((row) => ({
          locationId: row.location.id,
          qtyOnHand: row.qtyOnHand,
          qtyReserved: row.qtyReserved,
        }));
        deliverFromReservations(states, allocations, qty);

        const rowsByKey = new Map(rows.map((row) => [row.location.id, row]));
        for (const state of states) {
          const entity = rowsByKey.get(state.locationId);
          if (!entity) continue;
          entity.qtyOnHand = state.qtyOnHand;
          entity.qtyReserved = state.qtyReserved;
          await manager.save(entity);
        }

        line.qtyDelivered += qty;
        await manager.save(line);

        await manager.save(
          manager.create(DeliveryLine, {
            delivery,
            item: line.item!,
            codeSnapshot: line.codeSnapshot,
            descriptionSnapshot: line.descriptionSnapshot,
            salesOrderLineId: line.id,
            qty,
          }),
        );
      }

      // Trim fully-served reservation rows for these lines.
      await this.reconcileReservations(manager, order.id, order.lines);

      // Fully-delivered → Closed; any delivery → at least Delivered.
      const allDelivered =
        order.lines.length > 0 &&
        order.lines.every((line) => line.qty <= line.qtyDelivered);
      order.status = allDelivered
        ? SalesOrderStatus.Closed
        : SalesOrderStatus.Delivered;
      await manager.save(order);

      return manager.findOne(Delivery, {
        where: { id: delivery.id },
        relations: ['lines'],
      });
    });
  }

  private async reservationsForLine(
    manager: DataSource['manager'],
    orderId: number,
    itemId: number,
  ): Promise<ReserveAllocation[]> {
    const reservations = await manager.find(Reservation, {
      where: { salesOrder: { id: orderId }, item: { id: itemId } },
      relations: ['location'],
      order: { location: { id: 'ASC' } },
    });
    return reservations.map((reservation) => ({
      locationId: reservation.location.id,
      qty: reservation.qty,
    }));
  }

  /** Drop reservation rows whose stock has been fully consumed by deliveries. */
  private async reconcileReservations(
    manager: DataSource['manager'],
    orderId: number,
    orderLines: SalesOrderLine[],
  ): Promise<void> {
    const reservations = await manager.find(Reservation, {
      where: { salesOrder: { id: orderId } },
      relations: ['item'],
    });
    const itemIds = new Set(
      orderLines.filter((line) => line.item?.id).map((line) => line.item!.id),
    );
    const deliveredByItem = new Map<number, number>();
    for (const line of orderLines) {
      if (!line.item?.id) continue;
      deliveredByItem.set(
        line.item.id,
        (deliveredByItem.get(line.item.id) ?? 0) + line.qtyDelivered,
      );
    }
    const toRemove = reservations.filter(
      (reservation) =>
        itemIds.has(reservation.item.id) &&
        (deliveredByItem.get(reservation.item.id) ?? 0) >= reservation.qty,
    );
    if (toRemove.length > 0) await manager.remove(toRemove);
  }

  findAll() {
    return this.deliveries.find({
      relations: ['salesOrder', 'salesOrder.client', 'lines'],
      order: { deliveredAt: 'DESC' },
    });
  }

  async findOne(id: number) {
    const delivery = await this.deliveries.findOne({
      where: { id },
      relations: ['salesOrder', 'salesOrder.lines', 'lines', 'createdBy'],
    });
    if (!delivery) throw new NotFoundException('Delivery not found');
    return delivery;
  }

  private async allocateDeliveryNo(
    manager: DataSource['manager'],
  ): Promise<string> {
    const year = new Date().getFullYear().toString().slice(-2);
    return this.numbering.next(
      manager,
      `delivery:${year}`,
      (value) => `DEL-${year}-${String(value).padStart(4, '0')}`,
      async () => {
        const result: Array<{ max_seq: string | null }> = await manager.query(
          `SELECT COALESCE(MAX(CAST(SUBSTRING(delivery_no FROM 'DEL-[0-9]*-([0-9]+)') AS INTEGER)), 0) AS max_seq FROM deliveries WHERE delivery_no LIKE $1`,
          [`DEL-${year}-%`],
        );
        return Number(result[0]?.max_seq ?? 0);
      },
    );
  }
}
