import { BadRequestException } from '@nestjs/common';
import {
  AdjustmentType,
  TransactionType,
} from '../common/enums/transaction-type.enum';
import {
  applyStockMove,
  consumeReserved,
  deliverFromReservations,
  deliverReserved,
  releaseReservation,
  reserveBestEffort,
  snapshotRowsFor,
} from './stock-engine';

const rowsFor = (seed: Record<number, [number, number]>) =>
  Object.entries(seed).map(([locationId, [onHand, reserved]]) => ({
    locationId: Number(locationId),
    qtyOnHand: onHand,
    qtyReserved: reserved,
  }));

describe('applyStockMove', () => {
  it('transfers qty between two locations', () => {
    const rows = rowsFor({ 1: [10, 0], 2: [5, 0] });
    const { rows: after } = applyStockMove(rows, 0, {
      type: TransactionType.Transfer,
      qty: 4,
      fromLocationId: 1,
      toLocationId: 2,
    });
    expect(after.find((r) => r.locationId === 1)?.qtyOnHand).toBe(6);
    expect(after.find((r) => r.locationId === 2)?.qtyOnHand).toBe(9);
  });

  it('creates the destination row on first receipt into a location', () => {
    const rows = rowsFor({ 1: [3, 0] });
    const { rows: after } = applyStockMove(rows, 0, {
      type: TransactionType.Transfer,
      qty: 3,
      fromLocationId: 1,
      toLocationId: 9,
    });
    expect(after.find((r) => r.locationId === 9)?.qtyOnHand).toBe(3);
  });

  it('refuses a transfer to the same location', () => {
    expect(() =>
      applyStockMove(rowsFor({ 1: [5, 0] }), 0, {
        type: TransactionType.Transfer,
        qty: 1,
        fromLocationId: 1,
        toLocationId: 1,
      }),
    ).toThrow(BadRequestException);
  });

  it('never oversells: sale beyond on-hand throws with the available amount', () => {
    expect(() =>
      applyStockMove(rowsFor({ 1: [2, 0] }), 0, {
        type: TransactionType.Sale,
        qty: 3,
        fromLocationId: 1,
      }),
    ).toThrow('Insufficient stock. Available: 2, Requested: 3');
  });

  it('sale increments qtySold', () => {
    const { qtySold } = applyStockMove(rowsFor({ 1: [5, 0] }), 7, {
      type: TransactionType.Sale,
      qty: 2,
      fromLocationId: 1,
    });
    expect(qtySold).toBe(9);
  });

  it('return decrements qtySold and refuses returning more than sold', () => {
    const { qtySold } = applyStockMove(rowsFor({ 1: [0, 0] }), 5, {
      type: TransactionType.Return,
      qty: 2,
      toLocationId: 1,
    });
    expect(qtySold).toBe(3);
    expect(() =>
      applyStockMove(rowsFor({ 1: [0, 0] }), 1, {
        type: TransactionType.Return,
        qty: 2,
        toLocationId: 1,
      }),
    ).toThrow('Cannot return 2 units. Only 1 units have been sold');
  });

  it('adjustment requires a reason and honors increase/decrease', () => {
    expect(() =>
      applyStockMove(rowsFor({ 1: [1, 0] }), 0, {
        type: TransactionType.Adjustment,
        qty: 1,
        toLocationId: 1,
        adjustmentType: AdjustmentType.Increase,
      }),
    ).toThrow('Adjustment reason is required');
    const { rows: up } = applyStockMove(rowsFor({ 1: [1, 0] }), 0, {
      type: TransactionType.Adjustment,
      qty: 4,
      toLocationId: 1,
      adjustmentType: AdjustmentType.Increase,
      adjustmentReason: 'NewArrival',
    });
    expect(up.find((r) => r.locationId === 1)?.qtyOnHand).toBe(5);
    expect(() =>
      applyStockMove(rowsFor({ 1: [1, 0] }), 0, {
        type: TransactionType.Adjustment,
        qty: 2,
        fromLocationId: 1,
        adjustmentType: AdjustmentType.Decrease,
        adjustmentReason: 'Damage',
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects non-positive quantities', () => {
    expect(() =>
      applyStockMove(rowsFor({ 1: [5, 0] }), 0, {
        type: TransactionType.Sale,
        qty: 0,
        fromLocationId: 1,
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      applyStockMove(rowsFor({ 1: [5, 0] }), 0, {
        type: TransactionType.Sale,
        qty: -2,
        fromLocationId: 1,
      }),
    ).toThrow(BadRequestException);
  });
});

describe('snapshotRowsFor', () => {
  it('snapshots touched locations, defaulting missing ones to zero', () => {
    const snapshot = snapshotRowsFor(rowsFor({ 1: [10, 2] }), [1, 3]);
    expect(snapshot).toEqual({
      '1': { onHand: 10, reserved: 2 },
      '3': { onHand: 0, reserved: 0 },
    });
  });
});

describe('reservations (Phase 2B)', () => {
  it('reserves showroom-first, then storage, never beyond availability', () => {
    const rows = rowsFor({ 1: [3, 1], 2: [4, 0] }); // available: showroom 2, storage 4
    const { allocations, short } = reserveBestEffort(rows, 5, [1, 2]);
    expect(allocations).toEqual([
      { locationId: 1, qty: 2 },
      { locationId: 2, qty: 3 },
    ]);
    expect(short).toBe(0);
    expect(rows.find((r) => r.locationId === 1)?.qtyReserved).toBe(3);
    expect(rows.find((r) => r.locationId === 2)?.qtyReserved).toBe(3);
  });

  it('flags a shortage when demand exceeds availability and reserves partial', () => {
    const rows = rowsFor({ 1: [1, 0] });
    const { allocations, short } = reserveBestEffort(rows, 5, [1, 2]);
    expect(allocations).toEqual([{ locationId: 1, qty: 1 }]);
    expect(short).toBe(4);
  });

  it('release gives reserved quantity back without touching on-hand', () => {
    const rows = rowsFor({ 1: [5, 2] });
    releaseReservation(rows, [{ locationId: 1, qty: 2 }]);
    expect(rows.find((r) => r.locationId === 1)).toEqual({
      locationId: 1,
      qtyOnHand: 5,
      qtyReserved: 0,
    });
  });

  it('release refuses to exceed the reserved amount', () => {
    const rows = rowsFor({ 1: [5, 2] });
    expect(() => releaseReservation(rows, [{ locationId: 1, qty: 3 }])).toThrow(
      BadRequestException,
    );
  });

  it('consume (sale against order) drops on-hand and reserved together', () => {
    const rows = rowsFor({ 1: [5, 2], 2: [1, 0] });
    const { rows: after, qtySold } = consumeReserved(
      rows,
      [{ locationId: 1, qty: 2 }],
      10,
    );
    expect(after.find((r) => r.locationId === 1)).toEqual({
      locationId: 1,
      qtyOnHand: 3,
      qtyReserved: 0,
    });
    expect(qtySold).toBe(12);
  });

  it('deliver consumes the reservation (stock leaves the ledger)', () => {
    const rows = rowsFor({ 1: [5, 3] });
    deliverReserved(rows, [{ locationId: 1, qty: 3 }]);
    expect(rows.find((r) => r.locationId === 1)).toEqual({
      locationId: 1,
      qtyOnHand: 2,
      qtyReserved: 0,
    });
  });

  it('deliver refuses when reserved quantity is insufficient', () => {
    const rows = rowsFor({ 1: [5, 1] });
    expect(() => deliverReserved(rows, [{ locationId: 1, qty: 2 }])).toThrow(
      BadRequestException,
    );
  });

  it('deliverFromReservations consumes reserved first, then unreserved availability', () => {
    const rows = rowsFor({ 1: [5, 2], 2: [3, 0] });
    // Needs 4: consumes the 2 reserved at location 1, then 2 of its unreserved availability.
    deliverFromReservations(rows, [{ locationId: 1, qty: 2 }], 4);
    expect(rows.find((r) => r.locationId === 1)).toEqual({
      locationId: 1,
      qtyOnHand: 1,
      qtyReserved: 0,
    });
    expect(rows.find((r) => r.locationId === 2)).toEqual({
      locationId: 2,
      qtyOnHand: 3,
      qtyReserved: 0,
    });
  });

  it('deliverFromReservations throws when total availability is short', () => {
    const rows = rowsFor({ 1: [1, 1] }); // only 1 available overall
    expect(() =>
      deliverFromReservations(rows, [{ locationId: 1, qty: 1 }], 2),
    ).toThrow(BadRequestException);
  });
});
