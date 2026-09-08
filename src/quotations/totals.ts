/**
 * Money helpers — all arithmetic in integer cents; DB columns stay numeric(12,2)
 * and API payloads use plain numbers rounded to 2 decimals.
 */
export function toCents(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  return Math.round(Number(value) * 100);
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

export interface QuotationTotalsInput {
  lines: { totalPriceAfterDiscount: string | number }[];
  discountGlobalPercent: string | number;
  vatPercent: string | number;
  currency: string;
}

export interface QuotationTotals {
  subtotal: number;
  globalDiscountAmount: number;
  vatAmount: number;
  grandTotal: number;
  currency: string;
  activeLineCount: number;
}

/** subtotal − global% − vat% on the discounted base, computed in cents. */
export function computeQuotationTotals(
  input: QuotationTotalsInput,
): QuotationTotals {
  const subtotalCents = input.lines.reduce(
    (sum, line) => sum + toCents(line.totalPriceAfterDiscount),
    0,
  );
  const discountCents = Math.round(
    (subtotalCents * toCents(input.discountGlobalPercent)) / (100 * 100),
  );
  const vatCents = Math.round(
    ((subtotalCents - discountCents) * toCents(input.vatPercent)) / (100 * 100),
  );
  return {
    subtotal: fromCents(subtotalCents),
    globalDiscountAmount: fromCents(discountCents),
    vatAmount: fromCents(vatCents),
    grandTotal: fromCents(subtotalCents - discountCents + vatCents),
    currency: input.currency,
    activeLineCount: input.lines.length,
  };
}
