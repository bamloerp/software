export type ScheduleStageInput = {
  stage?: string | null;
  title?: string | null;
  description?: string | null;
};

const clean = (value: string | null | undefined) =>
  String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');

export function getCanonicalScheduleStage(item: ScheduleStageInput): { label: string; rank: number } {
  const stage = clean(item.stage);
  const task = clean(`${item.title || ''} ${item.description || ''}`);
  const combined = `${stage} ${task}`;

  if (combined.includes('FOUNDATION') || stage === 'SUBSTRUCTURE') {
    return { label: 'Foundation', rank: 1 };
  }
  if (
    stage.includes('SUPERSTRUCTURE') ||
    stage.includes('BRICKWORK TO RINGBEAM') ||
    stage.includes('BRICKWORK TO RING BEAM')
  ) {
    return { label: 'Superstructure Brickwork', rank: 2 };
  }
  if (stage.includes('ABOVE RING')) return { label: 'Above Ring Beam', rank: 3 };
  if (combined.includes('ROOF')) return { label: 'Roofing', rank: 4 };
  if (
    combined.includes('TUBING') ||
    combined.includes('CHOPPING') ||
    combined.includes('CHASING') ||
    stage === 'ELECTRICALS'
  ) {
    return { label: 'Electrical Chopping and Tubing', rank: 5 };
  }
  if (combined.includes('PLASTER')) return { label: 'Plastering', rank: 6 };
  if (combined.includes('SCREED')) return { label: 'Screeds', rank: 7 };
  if (combined.includes('ELECTRICAL') || combined.includes('WIRING')) {
    return { label: 'Electrical Wiring and Fitting', rank: 8 };
  }
  if (combined.includes('CEILING') || combined.includes('CORNICE')) {
    return { label: 'Ceiling', rank: 9 };
  }
  if (combined.includes('WINDOW') || combined.includes('GLAZING')) {
    return { label: 'Aluminium Windows', rank: 10 };
  }
  if (combined.includes('TIL')) return { label: 'Floor Tiles', rank: 11 };
  if (combined.includes('PLUMB') || combined.includes('SANITARY')) {
    return { label: 'Plumbing', rank: 12 };
  }
  if (
    combined.includes('DOOR') ||
    combined.includes('LOCK') ||
    combined.includes('IRON MONG') ||
    combined.includes('JOINERY')
  ) {
    return { label: 'Door and Lock Fitting', rank: 13 };
  }
  if (combined.includes('PAINT')) return { label: 'Painting', rank: 14 };
  if (combined.includes('HOUSE') || combined.includes('CLEAN')) {
    return { label: 'House Keeping', rank: 15 };
  }

  return { label: String(item.stage || '').trim() || 'Other Works', rank: 100 };
}

export function compareScheduleStages(a: ScheduleStageInput, b: ScheduleStageInput): number {
  return getCanonicalScheduleStage(a).rank - getCanonicalScheduleStage(b).rank;
}
