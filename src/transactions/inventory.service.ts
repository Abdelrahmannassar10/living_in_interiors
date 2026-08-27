import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Item } from '../items/entities/item.entity';
import { Location } from '../locations/entities/location.entity';
import { AdjustmentType, TransactionType } from '../common/enums/transaction-type.enum';

export interface StockSnapshot { showroom: number; storage1: number; storage2: number; sold: number; }
export interface InventoryChange { item: Item; type: TransactionType; fromLocation?: Location | null; toLocation?: Location | null; qty: number; adjustmentType?: AdjustmentType; adjustmentReason?: string; }

@Injectable()
export class InventoryService {
  async applyTransaction(manager: EntityManager, params: InventoryChange): Promise<{ before: StockSnapshot; after: StockSnapshot }> {
    const before = this.snapshot(params.item);
    if (params.type === TransactionType.Transfer) {
      this.requirePhysical(params.fromLocation); this.requirePhysical(params.toLocation);
      if (params.fromLocation!.id === params.toLocation!.id) throw new BadRequestException('From and To locations cannot be the same');
      this.decrement(params.item, params.fromLocation!.id, params.qty);
      this.increment(params.item, params.toLocation!.id, params.qty);
    } else if (params.type === TransactionType.Sale) {
      this.requirePhysical(params.fromLocation);
      this.decrement(params.item, params.fromLocation!.id, params.qty);
      params.item.qtySold += params.qty;
    } else if (params.type === TransactionType.Return) {
      this.requirePhysical(params.toLocation);
      if (params.item.qtySold < params.qty) throw new BadRequestException(`Cannot return ${params.qty} units. Only ${params.item.qtySold} units have been sold`);
      this.increment(params.item, params.toLocation!.id, params.qty);
      params.item.qtySold -= params.qty;
    } else if (params.type === TransactionType.Adjustment) {
      if (!params.adjustmentReason) throw new BadRequestException('Adjustment reason is required');
      if (params.adjustmentType === AdjustmentType.Increase) {
        this.requirePhysical(params.toLocation); this.increment(params.item, params.toLocation!.id, params.qty);
        if (params.adjustmentReason === 'New Arrival') params.item.initialQty += params.qty;
      } else {
        this.requirePhysical(params.fromLocation); this.decrement(params.item, params.fromLocation!.id, params.qty);
      }
    }
    return { before, after: this.snapshot(params.item) };
  }

  private snapshot(item: Item): StockSnapshot { return { showroom: item.qtyShowroom, storage1: item.qtyStorage1, storage2: item.qtyStorage2, sold: item.qtySold }; }
  private requirePhysical(location?: Location | null): asserts location is Location { if (!location) throw new BadRequestException('Location not found'); if (!location.isPhysical) throw new BadRequestException(`${location.name} is not a physical location`); }
  private decrement(item: Item, locationId: number, qty: number): void { const available = this.get(item, locationId); if (available < qty) throw new BadRequestException(`Insufficient stock. Available: ${available}, Requested: ${qty}`); this.set(item, locationId, available - qty); }
  private increment(item: Item, locationId: number, qty: number): void { this.set(item, locationId, this.get(item, locationId) + qty); }
  private get(item: Item, locationId: number): number { if (locationId === 1) return item.qtyShowroom; if (locationId === 2) return item.qtyStorage1; if (locationId === 3) return item.qtyStorage2; throw new BadRequestException(`Location with ID ${locationId} not found`); }
  private set(item: Item, locationId: number, qty: number): void { if (locationId === 1) item.qtyShowroom = qty; else if (locationId === 2) item.qtyStorage1 = qty; else if (locationId === 3) item.qtyStorage2 = qty; else throw new BadRequestException(`Location with ID ${locationId} not found`); }
}