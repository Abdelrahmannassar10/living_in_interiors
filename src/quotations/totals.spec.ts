import { computeQuotationTotals, toCents } from './totals';

describe('toCents', () => {
  it('converts decimal strings to integer cents', () => {
    expect(toCents('14.99')).toBe(1499);
    expect(toCents(0.1 + 0.2)).toBe(30); // 0.30000000000000004 -> 30
  });
  it('treats null/undefined/empty as zero', () => {
    expect(toCents(null)).toBe(0);
    expect(toCents(undefined)).toBe(0);
    expect(toCents('')).toBe(0);
  });
});

describe('computeQuotationTotals', () => {
  const base = {
    discountGlobalPercent: 0,
    vatPercent: 0,
    currency: 'USD',
  };

  it('sums line totals with no discount or VAT', () => {
    const result = computeQuotationTotals({
      ...base,
      lines: [
        { totalPriceAfterDiscount: '100.00' },
        { totalPriceAfterDiscount: '250.50' },
      ],
    });
    expect(result.subtotal).toBe(350.5);
    expect(result.grandTotal).toBe(350.5);
    expect(result.activeLineCount).toBe(2);
  });

  it('applies the global discount before VAT (VAT on the discounted base)', () => {
    const result = computeQuotationTotals({
      ...base,
      lines: [{ totalPriceAfterDiscount: '1000.00' }],
      discountGlobalPercent: 10,
      vatPercent: 14,
    });
    expect(result.globalDiscountAmount).toBe(100);
    expect(result.vatAmount).toBeCloseTo(126, 2); // 14% of 900
    expect(result.grandTotal).toBeCloseTo(1026, 2);
  });

  it('rounds half-cent values deterministically', () => {
    const result = computeQuotationTotals({
      ...base,
      lines: [{ totalPriceAfterDiscount: '10.005' }],
      vatPercent: 14,
    });
    // 10.005 -> 1000.5 cents rounds to 1001 (subtotal 10.01); vat 14% of 1001 = 140.14 -> 1.40
    expect(result.subtotal).toBe(10.01);
  });

  it('handles zero lines', () => {
    const result = computeQuotationTotals({ ...base, lines: [] });
    expect(result.subtotal).toBe(0);
    expect(result.grandTotal).toBe(0);
  });
});
