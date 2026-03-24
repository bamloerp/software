import { describe, it, expect } from 'vitest';
import { money } from '@/lib/money';
import { sum2, applyFactor, sumN, multiply3, divide, identity, lineTotal, calcLine, subtotal, discount, netBeforeTax, tax, grandTotal } from '@/lib/formulas';

describe('Excel-mirrored formulas', () => {
  it('sum2', () => {
    expect(sum2(money(10), money(5)).toString()).toBe('15');
  });
  it('applyFactor', () => {
    expect(applyFactor(money(100), 0.4).toString()).toBe('40');
  });
  it('sumN', () => {
    expect(sumN(money(0.64), money(1.5), money(0.46)).toString()).toBe('2.6');
  });
  it('multiply3', () => {
    expect(multiply3(money(10), 0.7, 0.23).toString()).toBe('1.61');
  });
  it('divide', () => {
    expect(divide(money(48), 48).toString()).toBe('1');
  });
  it('identity', () => {
    expect(identity(42)).toBe(42);
  });
  it('lineTotal', () => {
    expect(lineTotal(money(5), 3).toString()).toBe('15');
  });
  it('calcLine', () => {
    const r = calcLine({ qty: 2, unitPrice: money(50), discount: { type: 'percent', value: 10 }, vatRate: 0.155 });
    expect(r.lineSubtotal.toString()).toBe('100');
    expect(r.lineDiscount.toString()).toBe('10');
    expect(r.lineTax.toString()).toBe('13.5');
    expect(r.lineTotal.toString()).toBe('103.5');
  });
  it('totals flow', () => {
    const lines = [calcLine({ qty: 1, unitPrice: money(100), vatRate: 0.155 }), calcLine({ qty: 2, unitPrice: money(50), vatRate: 0.155 })];
    const sub = subtotal(lines);
    expect(sub.toString()).toBe('200');
    const disc = discount(sub, 'bulk');
    expect(disc.toString()).toBe('10');
    const net = netBeforeTax(sub, disc);
    expect(net.toString()).toBe('190');
    const t = tax(net, 0.155);
    expect(t.toString()).toBe('28.5');
    expect(grandTotal(net, t).toString()).toBe('218.5');
  });
});

