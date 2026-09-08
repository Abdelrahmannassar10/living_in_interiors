import { BadRequestException } from '@nestjs/common';
import { AdjustmentType, TransactionType } from '../common/enums/transaction-type.enum';

export interface StockRowState {
  locationId: number;
  qtyOnHand: number;
  qtyReserved: number;
}

export interface StockSnapshotEntry { onHand: number; reserved: number; }
/** Keyed by location id (as string, matching jsonb object keys). */
export type StockSnapshot = Record<string, StockSnapshotEntry>;

export interface StockMoveInput {
  type: TransactionType;
  qty: number;
  fromLocationId?: number | null;
  toLocationId?: number | null;
  adjustmentType?: AdjustmentType | null;
  adjustmentReason?: string | null;
}

export class InsufficientStockError extends BadRequestException {
  constructor(available: number, requested: number) {
    super(`Insufficient stock. Available: ${available}, Requested: ${requested}`);
  }
}

/**
 * Pure stock engine: mutates the given row states according to the move.
 * No DB access here — the caller is responsible for loading rows with a
 * pessimistic lock inside its transaction. Kept pure so invariants are unit-testable.
 */
export function applyStockMove(rows: StockRowState[], itemQtySold: number, input: StockMoveInput): { rows: StockRowState[]; qtySold: number } {
  const qty = input.qty;
  if (!Number.isInteger(qty) || qty <= 0) throw new BadRequestException('Quantity must be a positive integer');

  const rowFor = (locationId?: number | null): StockRowState => {
    if (!locationId) throw new BadRequestException('Location not found');
    let row = rows.find((candidate) => candidate.locationId === locationId);
    if (!row) {
      row = { locationId, qtyOnHand: 0, qtyReserved: 0 };
      rows.push(row);
    }
    return row;
  };

  const decrement = (row: StockRowState): void => {
    if (row.qtyOnHand < qty) throw new InsufficientStockError(row.qtyOnHand, qty);
    row.qtyOnHand -= qty;
  };
  const increment = (row: StockRowState): void => { row.qtyOnHand += qty; };

  if (input.type === TransactionType.Transfer) {
    const from = rowFor(input.fromLocationId);
    const to = rowFor(input.toLocationId);
    if (from.locationId === to.locationId) throw new BadRequestException('From and To locations cannot be the same');
    decrement(from);
    increment(to);
  } else if (input.type === TransactionType.Sale) {
    decrement(rowFor(input.fromLocationId));
    itemQtySold += qty;
  } else if (input.type === TransactionType.Return) {
    if (itemQtySold < qty) throw new BadRequestException(`Cannot return ${qty} units. Only ${itemQtySold} units have been sold`);
    increment(rowFor(input.toLocationId));
    itemQtySold -= qty;
  } else if (input.type === TransactionType.Adjustment) {
    if (!input.adjustmentReason) throw new BadRequestException('Adjustment reason is required');
    if (input.adjustmentType === AdjustmentType.Increase) {
      increment(rowFor(input.toLocationId));
    } else if (input.adjustmentType === AdjustmentType.Decrease) {
      decrement(rowFor(input.fromLocationId));
    } else {
      throw new BadRequestException('Adjustment type is required');
    }
  } else {
    throw new BadRequestException('Unknown transaction type');
  }

  return { rows, qtySold: itemQtySold };
}

export function snapshotRows(rows: StockRowState[]): StockSnapshot {
  const snapshot: StockSnapshot = {};
  for (const row of rows) snapshot[String(row.locationId)] = { onHand: row.qtyOnHand, reserved: row.qtyReserved };
  return snapshot;
}

export function snapshotRowsFor(rows: StockRowState[], locationIds: number[]): StockSnapshot {
  const snapshot: StockSnapshot = {};
  for (const locationId of locationIds) {
    const row = rows.find((candidate) => candidate.locationId === locationId);
    snapshot[String(locationId)] = { onHand: row?.qtyOnHand ?? 0, reserved: row?.qtyReserved ?? 0 };
  }
  return snapshot;
}
