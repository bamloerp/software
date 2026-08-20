import { describe, expect, it } from 'vitest';
import { validateGrnQuantities } from '@/lib/grn-verification';

describe('validateGrnQuantities', () => {
  it.each([
    [5, 2, 3],
    [5, 3, 2],
    [5, 5, 0],
  ])('accepts delivered=%d, accepted=%d, rejected=%d', (delivered, accepted, rejected) => {
    expect(() => validateGrnQuantities(delivered, accepted, rejected)).not.toThrow();
  });

  it('rejects quantities that do not account for the delivery', () => {
    expect(() => validateGrnQuantities(5, 2, 2)).toThrow(
      'Accepted and rejected quantities must equal the delivered quantity',
    );
  });
});