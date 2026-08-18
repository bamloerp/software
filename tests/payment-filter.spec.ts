import { describe, expect, it } from 'vitest';
import { filterUnpaidProjects } from '@/lib/payment-filter';

describe('filterUnpaidProjects', () => {
  it('removes projects whose full contract value has already been paid', () => {
    const projects = [
      { id: 'a', contractValueMinor: 1000n, totalPaidMinor: 1000n },
      { id: 'b', contractValueMinor: 1000n, totalPaidMinor: 500n },
      { id: 'c', contractValueMinor: 1000n, totalPaidMinor: 1500n },
      { id: 'd', contractValueMinor: 1000n, totalPaidMinor: 0n },
    ];

    expect(filterUnpaidProjects(projects)).toEqual([
      { id: 'b', contractValueMinor: 1000n, totalPaidMinor: 500n },
      { id: 'd', contractValueMinor: 1000n, totalPaidMinor: 0n },
    ]);
  });

  it('keeps projects with a remaining balance', () => {
    const projects = [
      { id: 'paid', contractValueMinor: 2000n, totalPaidMinor: 2000n },
      { id: 'open', contractValueMinor: 3000n, totalPaidMinor: 2500n },
    ];

    expect(filterUnpaidProjects(projects)).toEqual([
      { id: 'open', contractValueMinor: 3000n, totalPaidMinor: 2500n },
    ]);
  });
});
