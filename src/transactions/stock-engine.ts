import { BadRequestException } from '@nestjs/common';
import {
  AdjustmentType,
  TransactionType,
} from '../common/enums/transaction-type.enum';

export interface StockRowState {
  locationId: number;
  qtyOnHand: number;
  qtyReserved: number;
}

export interface StockSnapshotEntry {
  onHand: number;
  reserved: number;
}
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
    super(
      `Insufficient stock. Available: ${available}, Requested: ${requested}`,
    );
  }
}

/**
 * Pure stock engine: mutates the given row states according to the move.
 * No DB access here — the caller is responsible for loading rows with a
 * pessimistic lock inside its transaction. Kept pure so invariants are unit-testable.
 */
export function applyStockMove(
  rows: StockRowState[],
  itemQtySold: number,
  input: StockMoveInput,
): { rows: StockRowState[]; qtySold: number } {
  const qty = input.qty;
  if (!Number.isInteger(qty) || qty <= 0)
    throw new BadRequestException('Quantity must be a positive integer');

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
    if (row.qtyOnHand < qty)
      throw new InsufficientStockError(row.qtyOnHand, qty);
    row.qtyOnHand -= qty;
  };
  const increment = (row: StockRowState): void => {
    row.qtyOnHand += qty;
  };

  if (input.type === TransactionType.Transfer) {
    const from = rowFor(input.fromLocationId);
    const to = rowFor(input.toLocationId);
    if (from.locationId === to.locationId)
      throw new BadRequestException('From and To locations cannot be the same');
    decrement(from);
    increment(to);
  } else if (input.type === TransactionType.Sale) {
    decrement(rowFor(input.fromLocationId));
    itemQtySold += qty;
  } else if (input.type === TransactionType.Return) {
    if (itemQtySold < qty)
      throw new BadRequestException(
        `Cannot return ${qty} units. Only ${itemQtySold} units have been sold`,
      );
    increment(rowFor(input.toLocationId));
    itemQtySold -= qty;
  } else if (input.type === TransactionType.Adjustment) {
    if (!input.adjustmentReason)
      throw new BadRequestException('Adjustment reason is required');
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
  for (const row of rows)
    snapshot[String(row.locationId)] = {
      onHand: row.qtyOnHand,
      reserved: row.qtyReserved,
    };
  return snapshot;
}

export function snapshotRowsFor(
  rows: StockRowState[],
  locationIds: number[],
): StockSnapshot {
  const snapshot: StockSnapshot = {};
  for (const locationId of locationIds) {
    const row = rows.find((candidate) => candidate.locationId === locationId);
    snapshot[String(locationId)] = {
      onHand: row?.qtyOnHand ?? 0,
      reserved: row?.qtyReserved ?? 0,
    };
  }
  return snapshot;
}

/** A portion of a reservation tied to one location. */
export interface ReserveAllocation {
  locationId: number;
  qty: number;
}

/**
 * Reserves `qty` units best-effort, trying locations in `locationOrder` and
 * taking only currently-available units (onHand - reserved). Returns the
 * allocations made plus the shortfall. The caller flags a per-line shortage
 * when `short > 0` — reserving what exists is intentional (partial fill).
 */
export function reserveBestEffort(
  rows: StockRowState[],
  qty: number,
  locationOrder: number[],
): { allocations: ReserveAllocation[]; short: number } {
  let remaining = qty;
  const allocations: ReserveAllocation[] = [];
  for (const locationId of locationOrder) {
    if (remaining <= 0) break;
    const row = rows.find((candidate) => candidate.locationId === locationId);
    if (!row) continue;
    const available = row.qtyOnHand - row.qtyReserved;
    const take = Math.min(available, remaining);
    if (take > 0) {
      row.qtyReserved += take;
      remaining -= take;
      allocations.push({ locationId, qty: take });
    }
  }
  return { allocations, short: remaining };
}

/** Reverses a reservation (cancel): reserved qty is given back, onHand untouched. */
export function releaseReservation(
  rows: StockRowState[],
  allocations: ReserveAllocation[],
): StockRowState[] {
  for (const allocation of allocations) {
    const row = rows.find(
      (candidate) => candidate.locationId === allocation.locationId,
    );
    if (!row) continue;
    if (row.qtyReserved < allocation.qty)
      throw new BadRequestException(
        'Reservation release exceeds reserved quantity',
      );
    row.qtyReserved -= allocation.qty;
  }
  return rows;
}

/**
 * Sale recorded against a confirmed sales order: the reserved units are the
 * ones that leave — both onHand and reserved drop atomically, so availability
 * among the remaining stock is unchanged. Throws if the allocation exceeds the
 * reserved quantities (delivery of a line cannot exceed reserved+on-hand).
 */
export function consumeReserved(
  rows: StockRowState[],
  allocations: ReserveAllocation[],
  itemQtySold: number,
): { rows: StockRowState[]; qtySold: number } {
  for (const allocation of allocations) {
    const row = rows.find(
      (candidate) => candidate.locationId === allocation.locationId,
    );
    if (!row) throw new BadRequestException('Reserved row not found');
    if (row.qtyOnHand < allocation.qty || row.qtyReserved < allocation.qty) {
      throw new InsufficientStockError(
        Math.min(row.qtyOnHand, row.qtyReserved),
        allocation.qty,
      );
    }
    row.qtyOnHand -= allocation.qty;
    row.qtyReserved -= allocation.qty;
  }
  const sold = allocations.reduce((sum, allocation) => sum + allocation.qty, 0);
  return { rows, qtySold: itemQtySold + sold };
}

/**
 * Delivery consumes the reserved allocation: the goods physically leave the
 * ledger at handover (onHand and reserved both drop). Release-on-cancel keeps
 * onHand; this is the "stock leaves the ledger at delivery" path.
 */
export function deliverReserved(
  rows: StockRowState[],
  allocations: ReserveAllocation[],
): StockRowState[] {
  for (const allocation of allocations) {
    const row = rows.find(
      (candidate) => candidate.locationId === allocation.locationId,
    );
    if (!row) throw new BadRequestException('Delivered row not found');
    if (row.qtyOnHand < allocation.qty || row.qtyReserved < allocation.qty) {
      throw new InsufficientStockError(
        Math.min(row.qtyOnHand, row.qtyReserved),
        allocation.qty,
      );
    }
    row.qtyOnHand -= allocation.qty;
    row.qtyReserved -= allocation.qty;
  }
  return rows;
}

/**
 * Delivers `qty` units: consumes the reserved allocations first (in allocation
 * order), then falls through to unreserved availability (onHand - reserved)
 * so shortage-fulfilled lines can be fulfilled at delivery time once stock
 * arrives. Throws if total available is still short.
 */
export function deliverFromReservations(
  rows: StockRowState[],
  allocations: ReserveAllocation[],
  qty: number,
): StockRowState[] {
  let remaining = qty;
  for (const allocation of allocations) {
    if (remaining <= 0) break;
    const row = rows.find(
      (candidate) => candidate.locationId === allocation.locationId,
    );
    if (!row) continue;
    const take = Math.min(allocation.qty, remaining);
    if (row.qtyOnHand < take || row.qtyReserved < take)
      throw new InsufficientStockError(
        Math.min(row.qtyOnHand, row.qtyReserved),
        take,
      );
    row.qtyOnHand -= take;
    row.qtyReserved -= take;
    remaining -= take;
  }
  if (remaining > 0) {
    for (const row of rows) {
      if (remaining <= 0) break;
      const available = row.qtyOnHand - row.qtyReserved;
      const take = Math.min(available, remaining);
      if (take > 0) {
        row.qtyOnHand -= take;
        remaining -= take;
      }
    }
  }
  if (remaining > 0) throw new InsufficientStockError(0, remaining);
  return rows;
}
