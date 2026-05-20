export type ConstructionSummaryCategory = {
  key: string;
  label: string;
  detailLabel: string;
  order: number;
};

type SummaryLineInput = {
  section?: string | null;
  description?: string | null;
  itemType?: string | null;
};

const SUMMARY_CATEGORIES: ConstructionSummaryCategory[] = [
  { key: 'FOUNDATIONS', label: 'FOUNDATION MATERIALS AND LABOUR', detailLabel: 'FOUNDATION', order: 1 },
  {
    key: 'SUPERSTRUCTURE_TO_RING_BEAM',
    label: 'SUPERSTRUCTURE MATERIALS AND LABOUR TO RING BEAM',
    detailLabel: 'SUPERSTRUCTURE TO RING BEAM',
    order: 2,
  },
  { key: 'DOOR_FRAMES', label: 'DOOR FRAMES', detailLabel: 'DOOR FRAMES', order: 3 },
  {
    key: 'BRICKWORK_ABOVE_RING_BEAM',
    label: 'BRICKWORK ABOVE RING BEAM MATERIALS AND LABOUR',
    detailLabel: 'BRICKWORK ABOVE RING BEAM',
    order: 4,
  },
  { key: 'INTERNAL_PLASTERING', label: 'INTERNAL PLASTERING MATERIALS AND LABOUR', detailLabel: 'INTERNAL PLASTERING', order: 5 },
  { key: 'EXTERNAL_PLASTERING', label: 'EXTERNAL PLASTERING MATERIALS AND LABOUR', detailLabel: 'EXTERNAL PLASTERING', order: 6 },
  { key: 'SCREEDS', label: 'SCREED MATERIALS AND LABOUR', detailLabel: 'SCREED', order: 7 },
  { key: 'ROOFING', label: 'ROOFING MATERIALS AND LABOUR', detailLabel: 'ROOFING', order: 8 },
  { key: 'ELECTRICALS', label: 'ELECTRICALS MATERIALS AND LABOUR', detailLabel: 'ELECTRICALS', order: 9 },
];

const CATEGORY_BY_KEY = new Map(SUMMARY_CATEGORIES.map((category) => [category.key, category]));

function normalize(value?: string | null) {
  return (value ?? '').trim().toUpperCase();
}

function fallbackCategory(section: string): ConstructionSummaryCategory {
  const label = section || 'ITEMS';
  return {
    key: `OTHER:${label}`,
    label,
    detailLabel: label,
    order: 100,
  };
}

export function getConstructionSummaryCategory(line: SummaryLineInput): ConstructionSummaryCategory {
  const section = normalize(line.section);
  const description = normalize(line.description);

  if (description.includes('DOOR FRAME') || section === 'METALWORK' || section === 'DOOR FRAMES') {
    return CATEGORY_BY_KEY.get('DOOR_FRAMES')!;
  }

  if (section === 'FOUNDATIONS' || section === 'FOUNDATION') {
    return CATEGORY_BY_KEY.get('FOUNDATIONS')!;
  }

  if (section === 'SUPERSTRUCTURE BRICKWORK' || section === 'SUPERSTRUCTURE TO RING BEAM') {
    return CATEGORY_BY_KEY.get('SUPERSTRUCTURE_TO_RING_BEAM')!;
  }

  if (section === 'ABOVE RING BEAM') {
    return CATEGORY_BY_KEY.get('BRICKWORK_ABOVE_RING_BEAM')!;
  }

  if (section === 'INTERNAL PLASTERING') {
    return CATEGORY_BY_KEY.get('INTERNAL_PLASTERING')!;
  }

  if (section === 'EXTERNAL PLASTERING') {
    return CATEGORY_BY_KEY.get('EXTERNAL_PLASTERING')!;
  }

  if (section === 'PLASTERING') {
    if (description.includes('EXTERNAL')) {
      return CATEGORY_BY_KEY.get('EXTERNAL_PLASTERING')!;
    }
    return CATEGORY_BY_KEY.get('INTERNAL_PLASTERING')!;
  }

  if (section === 'SCREEDS' || section === 'SCREED') {
    return CATEGORY_BY_KEY.get('SCREEDS')!;
  }

  if (section === 'ROOF COVERINGS' || section === 'ROOFING') {
    return CATEGORY_BY_KEY.get('ROOFING')!;
  }

  if (section === 'ELECTRICALS' || section === 'ELECTRICALS TUBING') {
    return CATEGORY_BY_KEY.get('ELECTRICALS')!;
  }

  return fallbackCategory(section);
}

export function compareConstructionSummaryCategories(
  a: ConstructionSummaryCategory,
  b: ConstructionSummaryCategory
) {
  if (a.order !== b.order) return a.order - b.order;
  return a.label.localeCompare(b.label);
}
