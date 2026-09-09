import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { DataSource, Repository } from 'typeorm';
import { ItemStock } from '../items/entities/item-stock.entity';
import { NumberingService } from '../common/services/numbering.service';
import { SalesOrderStatus } from '../common/enums/sales-order-status.enum';
import { SalesOrderLine } from '../sales-orders/entities/sales-order-line.entity';
import { SalesOrder } from '../sales-orders/entities/sales-order.entity';
import { Reservation } from '../reservations/entities/reservation.entity';
import { ReportsService } from '../reports/reports.service';
import { ReleasePermitStatus } from '../common/enums/release-permit-status.enum';
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
  private readonly logger = new Logger(DeliveriesService.name);
  constructor(
    private readonly dataSource: DataSource,
    private readonly numbering: NumberingService,
    private readonly reports: ReportsService,
    @InjectRepository(Delivery)
    private readonly deliveries: Repository<Delivery>,
  ) {}

  async create(orderId: number, dto: CreateDeliveryDto, actorId?: number) {
    const { delivery, order } = await this.dataSource.transaction(
      async (manager) => {
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
          order.lines
            .filter((line) => line.item)
            .map((line) => [line.id, line]),
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

        // Release-permit gate: every item being delivered must be covered by a
        // Released permit for this order. The sum of all non-cancelled permit
        // release quantities must cover the quantities being delivered now.
        await this.assertReleasePermits(manager, order.id, requested, lineById);

        // For each item, lock its stock rows (ordered by location id — deadlock rule),
        // derive reservation allocations, and consume the requested quantity.
        const deliveryNo = await this.allocateDeliveryNo(manager);
        const delivery = await manager.save(
          manager.create(Delivery, {
            deliveryNo,
            salesOrder: order,
            deliveredAt:
              dto.deliveredAt ?? new Date().toISOString().slice(0, 10),
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

        return {
          order,
          delivery: await manager.findOne(Delivery, {
            where: { id: delivery.id },
            relations: ['lines'],
          }),
        };
      },
    );

    // Best-effort delivery note PDF after commit; never blocks the delivery.
    if (delivery) {
      await this.writePdf(delivery, order).catch((error: Error) =>
        this.logger.warn(`Delivery PDF generation failed: ${error.message}`),
      );
    }
    return delivery;
  }

  private async writePdf(delivery: Delivery, order: SalesOrder): Promise<void> {
    const pdf = await this.reports.generateDeliveryPdf({ delivery, order });
    const dir = path.join(process.cwd(), 'uploads', 'deliveries');
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${delivery.deliveryNo}.pdf`);
    await fs.writeFile(filePath, pdf);
    await this.deliveries.update(delivery.id, { pdfPath: filePath });
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

  /**
   * Ensures every line being delivered is covered by a Released release permit.
   * Only permit lines from permits in the Released state count toward the
   * authorized quantity. Without a Released permit, delivery is blocked.
   */
  private async assertReleasePermits(
    manager: DataSource['manager'],
    orderId: number,
    requested: Map<number, number>,
    lineById: Map<number, SalesOrderLine>,
  ): Promise<void> {
    for (const [lineId, qty] of requested) {
      const rows: Array<{ released_qty: string }> = await manager.query(
        `SELECT COALESCE(SUM(rpl.qty), 0) AS released_qty
         FROM release_permit_lines rpl
         JOIN release_permits rp ON rp.id = rpl.release_permit_id
         WHERE rp.sales_order_id = $1
           AND rpl.sales_order_line_id = $2
           AND rp.status = $3`,
        [orderId, lineId, ReleasePermitStatus.Released],
      );
      const released = Number(rows[0]?.released_qty ?? 0);
      if (released < qty) {
        const line = lineById.get(lineId)!;
        throw new BadRequestException(
          `Line ${line.codeSnapshot ?? lineId} is not fully covered by a Released release permit: released ${released}, required ${qty}`,
        );
      }
    }
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
