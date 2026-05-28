export const MANUAL_ITEM_CATALOG_KEY = 'manualItemCatalog';
export const MANUAL_RATE_CODE_PREFIX = 'manual:';

export type ManualCatalogItem = {
  id: string;
  description: string;
  unit: string;
  quantity: number;
  rate: number;
  section: string;
  category: string;
  itemType: 'MATERIAL' | 'LABOUR';
};

export function manualRateCode(id: string) {
  return `${MANUAL_RATE_CODE_PREFIX}${id}`;
}
