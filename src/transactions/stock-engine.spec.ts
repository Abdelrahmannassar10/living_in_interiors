import { BadRequestException } from '@nestjs/common';
import { AdjustmentType, TransactionType } from '../common/enums/transaction-type.enum';
import { applyStockMove, snapshotRowsFor } from './stock-engine';

const rowsFor = (seed: Record<number, [number, number]>) =>
  Object.entries(seed).map(([locationId, [onHand, reserved]]) => ({ locationId: Number(locationId), qtyOnHand: onHand, qtyReserved: reserved }));

describe('applyStockMove', () => {
  it('transfers qty between two locations', () => {
    const rows = rowsFor({ 1: [10, 0], 2: [5, 0] });
    const { rows: after } = applyStockMove(rows, 0, { type: TransactionType.Transfer, qty: 4, fromLocationId: 1, toLocationId: 2 });
    expect(after.find((r) => r.locationId === 1)?.qtyOnHand).toBe(6);
    expect(after.find((r) => r.locationId === 2)?.qtyOnHand).toBe(9);
  });

  it('creates the destination row on first receipt into a location', () => {
    const rows = rowsFor({ 1: [3, 0] });
    const { rows: after } = applyStockMove(rows, 0, { type: TransactionType.Transfer, qty: 3, fromLocationId: 1, toLocationId: 9 });
    expect(after.find((r) => r.locationId === 9)?.qtyOnHand).toBe(3);
  });

  it('refuses a transfer to the same location', () => {
    expect(() => applyStockMove(rowsFor({ 1: [5, 0] }), 0, { type: TransactionType.Transfer, qty: 1, fromLocationId: 1, toLocationId: 1 }))
      .toThrow(BadRequestException);
  });

  it('never oversells: sale beyond on-hand throws with the available amount', () => {
    expect(() => applyStockMove(rowsFor({ 1: [2, 0] }), 0, { type: TransactionType.Sale, qty: 3, fromLocationId: 1 }))
      .toThrow('Insufficient stock. Available: 2, Requested: 3');
  });

  it('sale increments qtySold', () => {
    const { qtySold } = applyStockMove(rowsFor({ 1: [5, 0] }), 7, { type: TransactionType.Sale, qty: 2, fromLocationId: 1 });
    expect(qtySold).toBe(9);
  });

  it('return decrements qtySold and refuses returning more than sold', () => {
    const { qtySold } = applyStockMove(rowsFor({ 1: [0, 0] }), 5, { type: TransactionType.Return, qty: 2, toLocationId: 1 });
    expect(qtySold).toBe(3);
    expect(() => applyStockMove(rowsFor({ 1: [0, 0] }), 1, { type: TransactionType.Return, qty: 2, toLocationId: 1 }))
      .toThrow('Cannot return 2 units. Only 1 units have been sold');
  });

  it('adjustment requires a reason and honors increase/decrease', () => {
    expect(() => applyStockMove(rowsFor({ 1: [1, 0] }), 0, { type: TransactionType.Adjustment, qty: 1, toLocationId: 1, adjustmentType: AdjustmentType.Increase }))
      .toThrow('Adjustment reason is required');
    const { rows: up } = applyStockMove(rowsFor({ 1: [1, 0] }), 0, { type: TransactionType.Adjustment, qty: 4, toLocationId: 1, adjustmentType: AdjustmentType.Increase, adjustmentReason: 'NewArrival' });
    expect(up.find((r) => r.locationId === 1)?.qtyOnHand).toBe(5);
    expect(() => applyStockMove(rowsFor({ 1: [1, 0] }), 0, { type: TransactionType.Adjustment, qty: 2, fromLocationId: 1, adjustmentType: AdjustmentType.Decrease, adjustmentReason: 'Damage' }))
      .toThrow(BadRequestException);
  });

  it('rejects non-positive quantities', () => {
    expect(() => applyStockMove(rowsFor({ 1: [5, 0] }), 0, { type: TransactionType.Sale, qty: 0, fromLocationId: 1 })).toThrow(BadRequestException);
    expect(() => applyStockMove(rowsFor({ 1: [5, 0] }), 0, { type: TransactionType.Sale, qty: -2, fromLocationId: 1 })).toThrow(BadRequestException);
  });
});

describe('snapshotRowsFor', () => {
  it('snapshots touched locations, defaulting missing ones to zero', () => {
    const snapshot = snapshotRowsFor(rowsFor({ 1: [10, 2] }), [1, 3]);
    expect(snapshot).toEqual({ '1': { onHand: 10, reserved: 2 }, '3': { onHand: 0, reserved: 0 } });
  });
});
