export type WorksheetItem = {
  id: string;
  description: string;
  unit: string; // e.g., m3, no, bags, Km, m²
  defaultRate: number; // editable by user
};

export type WorksheetSection = {
  key: string;
  title: string;
  note?: string;
  items: WorksheetItem[];
};

// Seed with representative items from your images. Extend freely.
export const WORKSHEET_SECTIONS: WorksheetSection[] = [
  {
    key: 'foundation',
    title: 'WET TRADE MATERIALS AND SUNDRY — SUBSTRUCTURE (FOUNDATION)',
    note: 'Aggregates and cement include requirements for concrete bedding',
    items: [
      { id: 'common-bricks', description: 'Common bricks', unit: 'no', defaultRate: 0.16 },
      { id: 'river-sand', description: 'River sand', unit: 'm3', defaultRate: 20.0 },
      { id: 'pit-sand', description: 'Pit sand', unit: 'm3', defaultRate: 20.0 },
      { id: 'granite-19mm', description: '19mm Granite Quarry Stone aggregate', unit: 'm3', defaultRate: 32.50 },
      { id: 'fill-hardcore', description: 'Imported inert granular fill/Hardcore', unit: 'm3', defaultRate: 10.0 },
      { id: 'cement-pc15', description: 'Cement PC 15 (50kg bags)', unit: 'bags', defaultRate: 12.5 },
      { id: 'termite-poison', description: 'Termite Poison', unit: 'litre', defaultRate: 0.9 },
      { id: 'poly-sheething', description: '250 Micron black polythene sheeting', unit: 'm²', defaultRate: 1.0 },
      { id: 'brickforce-230', description: 'Brickforce for one brick wall (20 metre rolls) Ref C2', unit: 'rolls', defaultRate: 2.5 },
      { id: 'brickforce-115', description: 'Brickforce for half brick wall (20 metre rolls) Ref C2', unit: 'rolls', defaultRate: 2.5 },
      { id: 'transport', description: 'Transport', unit: 'Km', defaultRate: 0.65 },
    ],
  },
  {
    key: 'superstructure',
    title: 'SUPERSTRUCTURE (BRICKWORK, CONCRETE, REINFORCEMENT)',
    items: [
      { id: 'pit-sand-ss', description: 'Pit sand (in situ concrete and brickwork)', unit: 'm3', defaultRate: 20.0 },
      { id: 'river-sand-ss', description: 'River Sand', unit: 'm³', defaultRate: 20.0 },
      { id: 'cement-pc15-ss', description: 'Cement PC 15 (50kg bags)', unit: 'bags', defaultRate: 12.5 },
      { id: 'granite-19mm-ss', description: '19mm Granite Quarry Stone aggregates', unit: 'm³', defaultRate: 32.50 },
      { id: 'common-bricks-ss', description: 'Common bricks', unit: 'no', defaultRate: 0.16 },
      { id: 'dpc-230', description: 'Damp proof course for one brick wall (230mm) (22 metre rolls)', unit: 'rolls', defaultRate: 3.0 },
      { id: 'dpc-115', description: 'Damp proof course for half brick wall (115mm) (22 metre rolls)', unit: 'rolls', defaultRate: 2.0 },
      { id: 'brickforce-230-ss', description: 'Brickforce for one brick wall (230mm)', unit: 'rolls', defaultRate: 2.5 },
      { id: 'brickforce-115-ss', description: 'Brickforce for half brick wall (115mm)', unit: 'rolls', defaultRate: 2.5 },
      { id: 'y16', description: 'Y16 reinforcement steel', unit: 'length', defaultRate: 8.8 },
      { id: 'y12', description: 'Y12 reinforcement steel', unit: 'length', defaultRate: 5.2 },
      { id: 'y10', description: 'Y10 reinforcement steel', unit: 'length', defaultRate: 3.9 },
      { id: 'baling-wire', description: 'Baling wire', unit: 'kgs', defaultRate: 3.0 },
      { id: 'transport-ss', description: 'Transport', unit: 'Km', defaultRate: 0.65 },
    ],
  },
  {
    key: 'metalwork',
    title: 'METALWORK — DOOR FRAMES',
    items: [
      { id: 'door-frame-815x115', description: 'Door Frame size 815 x 115 mm.', unit: 'no', defaultRate: 35.0 },
      { id: 'door-frame-815x230', description: 'Door Frame Size 815x230', unit: 'no', defaultRate: 54.0 },
    ],
  },
  {
    key: 'plastering',
    title: 'PLASTERING',
    items: [
      { id: 'cement-internal', description: 'Internal plaster — Cement PC 15 (50kg bags)', unit: 'bags', defaultRate: 12.5 },
      { id: 'pitsand-internal', description: 'Internal plaster — Pitsand', unit: 'cm³', defaultRate: 20.0 },
      { id: 'cast-vent-internal', description: 'Cast plaster internal air vent (ab)', unit: 'no', defaultRate: 0.65 },
      { id: 'cement-external', description: 'External plaster — Cement PC 15 (50kg bags)', unit: 'bags', defaultRate: 12.5 },
      { id: 'pitsand-external', description: 'External plaster — Pitsand', unit: 'cm³', defaultRate: 20.0 },
      { id: 'cast-vent-external', description: 'Precast concrete external air vent (ab)', unit: 'no', defaultRate: 0.65 },
    ],
  },
];

