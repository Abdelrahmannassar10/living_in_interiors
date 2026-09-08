export enum TransactionType {
  Transfer = 'Transfer',
  Sale = 'Sale',
  Return = 'Return',
  Adjustment = 'Adjustment',
}

export enum AdjustmentType {
  Increase = 'Increase',
  Decrease = 'Decrease',
}

export enum AdjustmentReason {
  NewArrival = 'NewArrival',
  Damage = 'Damage',
  CountCorrection = 'CountCorrection',
  CustomerReturn = 'CustomerReturn',
  SupplierReturn = 'SupplierReturn',
}
