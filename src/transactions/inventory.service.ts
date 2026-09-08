import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Item } from '../items/entities/item.entity';
import { ItemStock } from '../items/entities/item-stock.entity';
import { Location } from '../locations/entities/location.entity';
import {
  applyStockMove,
  snapshotRowsFor,
  StockMoveInput,
  StockRowState,
  StockSnapshot,
} from './stock-engine';

export interface InventoryChange extends StockMoveInput {
  item: Item;
  fromLocation?: Location | null;
  toLocation?: Location | null;
}

/**
 * Loads and locks the stock rows for an item (ordered by location id to avoid
 * deadlocks between concurrent transactions) and applies the move through the
 * pure stock engine. Must be called inside an open DB transaction.
 */
@Injectable()
export class InventoryService {
  async applyTransaction(
    manager: EntityManager,
    params: InventoryChange,
  ): Promise<{ before: StockSnapshot; after: StockSnapshot }> {
    this.requirePhysical(params.fromLocation);
    this.requirePhysical(params.toLocation);
    const touched = [params.fromLocation?.id, params.toLocation?.id].filter(
      (id): id is number => typeof id === 'number',
    );

    const entities = await manager
      .createQueryBuilder(ItemStock, 'stock')
      .setLock('pessimistic_write')
      .leftJoinAndSelect('stock.location', 'location')
      .where('stock.item_id = :itemId', { itemId: params.item.id })
      .orderBy('stock.location_id', 'ASC')
      .getMany();

    const rows: StockRowState[] = entities.map((entity) => ({
      locationId: entity.location.id,
      qtyOnHand: entity.qtyOnHand,
      qtyReserved: entity.qtyReserved,
    }));
    const before = snapshotRowsFor(rows, touched);

    const result = applyStockMove(rows, params.item.qtySold, params);
    params.item.qtySold = result.qtySold;

    const byLocationId = new Map(
      entities.map((entity) => [entity.location.id, entity]),
    );
    const created: ItemStock[] = [];
    const updated: ItemStock[] = [];
    for (const row of result.rows) {
      const existing = byLocationId.get(row.locationId);
      if (existing) {
        existing.qtyOnHand = row.qtyOnHand;
        existing.qtyReserved = row.qtyReserved;
        updated.push(existing);
      } else {
        created.push(
          manager.create(ItemStock, {
            item: { id: params.item.id },
            location: { id: row.locationId },
            qtyOnHand: row.qtyOnHand,
            qtyReserved: row.qtyReserved,
          }),
        );
      }
    }
    if (updated.length > 0) await manager.save(updated);
    if (created.length > 0) await manager.save(created);

    return { before, after: snapshotRowsFor(result.rows, touched) };
  }

  private requirePhysical(location?: Location | null): void {
    if (location && !location.isPhysical)
      throw new Error(`${location.name} is not a physical location`);
  }
}
