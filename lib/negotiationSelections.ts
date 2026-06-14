import type { QuoteSnapshot } from '@/lib/quoteSnapshot';

export type NegotiationSelection = {
  included: boolean;
};

export type NegotiationSelectionMap = Record<string, NegotiationSelection>;

export function readNegotiationSelections(
  snapshot: Pick<QuoteSnapshot, 'meta'> | null | undefined,
): NegotiationSelectionMap {
  const raw = snapshot?.meta && typeof snapshot.meta === 'object'
    ? (snapshot.meta as Record<string, unknown>).negotiationSelections
    : null;

  if (!raw || typeof raw !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).flatMap(([lineId, value]) => {
      if (!value || typeof value !== 'object') {
        return [];
      }
      const included = (value as Record<string, unknown>).included;
      if (typeof included !== 'boolean') {
        return [];
      }
      return [[lineId, { included }]];
    }),
  );
}

export function isLineIncludedInNegotiation(
  snapshot: Pick<QuoteSnapshot, 'meta'> | null | undefined,
  lineId: string,
  defaultIncluded = true,
): boolean {
  const selections = readNegotiationSelections(snapshot);
  return selections[lineId]?.included ?? defaultIncluded;
}