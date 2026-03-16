export type QuoteLineSource = {
  code: string; // cell code from takeoff matrix
  description: string;
  unit?: string;
  rate?: number; // default unit price
  section?: string; // optional grouping
  itemType?: 'MATERIAL' | 'LABOUR';
};

// Define how computed cells map to quotation line items.
// Extend this list with all items you want on the printed quotation.
export const QUOTE_LINE_MAP: QuoteLineSource[] = [
  // FOUNDATION (examples)
  { code: 'A15', description: 'Common bricks', unit: 'no', rate: 0.16, section: 'FOUNDATIONS' },
  { code: 'B8', description: 'River sand', unit: 'm3', rate: 20.0, section: 'FOUNDATIONS' },
  { code: 'C8', description: 'Pit sand', unit: 'm3', rate: 20.0, section: 'FOUNDATIONS' },
  { code: 'D8', description: '19mm Grenite Quarry Stone aggregate', unit: 'm3', rate: 45.0, section: 'FOUNDATIONS' },
  { code: 'G7', description: 'Imported  inert granular fill/Hrdcore', unit: 'm3', rate: 15.0, section: 'FOUNDATIONS' },
  { code: 'G15', description: 'Cement PC 15 (50kg bags)', unit: 'bags', rate: 12.50, section: 'FOUNDATIONS' },
  //{ code: 'F15', description: 'Cement (50kg bag)', unit: 'bags', rate: 12.50, section: 'FOUNDATIONS' },
  { code: 'G12*5', description: 'Termite Poison', unit: 'litre', rate: 0.90, section: 'FOUNDATIONS' },
  { code: 'D4', description: '250 Micron black polythene sheeting', unit: 'm2', rate: 1.0, section: 'FOUNDATIONS' },
  { code: 'E7', description: 'Brickforce for one brick wall (20 metre rolls) Ref C2', unit: 'rolls', rate: 2.50, section: 'FOUNDATIONS' },
  { code: 'F7', description: 'Brickforce for half brick wall (20 metre rolls) Ref C2', unit: 'rolls', rate: 2.50, section: 'FOUNDATIONS' },
  { code: 'D16', description: 'Transport', unit: 'Km', rate: 0.65, section: 'FOUNDATIONS' },


  // SUPERSTRUCTURE (updates requested)
  { code: 'B45', description: 'Pit sand', unit: 'm3', rate: 20, section: 'SUPERSTRUCTURE BRICKWORK' },
  { code: 'A45+1', description: 'River Sand', unit: 'm3', rate: 20, section: 'SUPERSTRUCTURE BRICKWORK' },
  { code: 'D22+D33+G22', description: 'Cement PC 15 (50kg bags)', unit: 'bags', rate: 12.5, section: 'SUPERSTRUCTURE BRICKWORK' },
   {code: 'C45', description: '19mm Grenite Quarry Stone aggrecates', unit: 'm3', rate: 45, section: 'SUPERSTRUCTURE BRICKWORK' },
  { code: 'A36+A25', description: 'Common bricks', unit: 'no', rate: 0.16, section: 'SUPERSTRUCTURE BRICKWORK' },
  { code: 'B54', description: 'Damp proof course for one brick wall (20 metre rolls) (230mm)', unit: 'rolls', rate: 3.0, section: 'SUPERSTRUCTURE BRICKWORK' },
  { code: 'A54', description: 'Damp proof course for half brick wall (20 metre rolls) (115mm)', unit: 'rolls', rate: 2.0, section: 'SUPERSTRUCTURE BRICKWORK' },
  { code: 'F45', description: 'Brickforce for one brick wall (20 metre rolls)  (230mm)', unit: 'rolls', rate: 2.50, section: 'SUPERSTRUCTURE BRICKWORK' },
  { code: 'G45', description: 'Brickforce for half  brick wall (20 metre rolls)(115mm)', unit: 'rolls', rate: 2.50, section: 'SUPERSTRUCTURE BRICKWORK' },
  { code: 'D48', description: 'Y16 reinforcemet steel', unit: 'Length', rate: 8.80, section: 'SUPERSTRUCTURE BRICKWORK' },
  { code: 'F54+D45', description: 'Y12 reinforcemet steel', unit: 'Length', rate: 5.20, section: 'SUPERSTRUCTURE BRICKWORK' },
  { code: 'E45', description: 'Y10 reinforcement steel', unit: 'Length', rate: 3.90, section: 'SUPERSTRUCTURE BRICKWORK' },
  { code: 'E54', description: 'Bailing wire', unit: 'kgs', rate: 3.0, section: 'SUPERSTRUCTURE BRICKWORK' },
  { code: 'C29', description: 'Transport', unit: 'Km', rate: 0.65, section: 'SUPERSTRUCTURE BRICKWORK' },
  { code: 'C4', description: '228mm Timber for Ring Beam Shuttering', unit: 'm', rate: 1.50, section: 'SUPERSTRUCTURE BRICKWORK' },


  // METALWORK
  { code: 'C54', description: 'Door Frames (230mm)', unit: 'no', rate: 5.20, section: 'METALWORK' },
  { code: 'D54', description: 'Door Frames (115mm)', unit: 'no', rate: 3.90, section: 'METALWORK' },

  //PLASTERING
  { code: 'E22+E33', description: 'Cement PC 15 (50kg bags)', unit: 'bags', rate: 12.5, section: 'PLASTERING' },
  { code: 'H22-150', description: 'One coat 1:4 cement sand plaster finished with a wood float on internal walls.', unit: 'm2', rate: 2.50, section: 'PLASTERING', itemType: 'LABOUR' },
  { code: 'I22', description: 'One coat 1:4 cement sand plaster finished with a wood float on extenal wall', unit: 'm3', rate: 2.50, section: 'PLASTERING', itemType: 'LABOUR' },
  {code : 'A51*3/8', description: 'Pit sand internal', unit: 'cm3', rate: 19.5, section: 'PLASTERING' },
  // { code: 'D71', description: 'Transport', unit: 'Km', rate: 0.65, section: 'PLASTERING' },

  //EXTERNAL PLASTERING
  //EXTERNAL PLASTERING
  { code: 'F22+F33+8', description: 'Cement PC 15 (50kg bags)', unit: 'bags', rate: 12.5, section: 'PLASTERING' },
  { code: 'D52', description: 'Pit sand external', unit: 'cm3', rate: 20, section: 'PLASTERING' },
  { code: 'G51', description: 'Internal Airvents', unit: 'no', rate: 5.0, section: 'PLASTERING' },
  { code: 'H51', description: 'External Airvents', unit: 'no', rate: 5.0, section: 'PLASTERING' },
  // { code: 'H71', description: 'River sand', unit: 'm3', rate: 20, section: 'EXTERNAL PLASTERING' },
  // { code: 'I71', description: 'Transport', unit: 'Km', rate: 0.65, section: 'EXTERNAL PLASTERING' },

  // GRANO/POWERVLOAT FLOOR 
  { code: 'D25', description: 'Cement PC 15 (50kg bags)', unit: 'bags', rate: 12.5, section: 'SCREEDS' },
  { code: 'J22*0.05', description: 'River sand', unit: 'm3', rate: 20, section: 'SCREEDS' },
  //  { code: 'G52', description: 'Transport', unit: 'Km', rate: 0.65, section: 'SCREEDS' },

  // ROOF COVERING
  { code: 'D4*17', description: 'Concrete tiles  Double Roman black', unit: 'no', rate: 0.95, section: 'ROOF COVERINGS' },
  //  { code: 'F66', description: 'Roll top ridges ', unit: 'no', rate: 1.50, section: 'ROOF COVERINGS' },
  // { code: 'G66', description: 'Roofing sheets (0.50mm gauge)', unit: 'm2', rate: 10.0, section: 'ROOF COVERINGS' },
  // { code: 'H66', description: 'Roofing sheets (0.60mm gauge)', unit: 'm2', rate: 11.0, section: 'ROOF COVERINGS' },

  // STRUCTURAL ROOF TRUSSES
  { code: 'D4*0.082304527', description: '228*38mm*6m', unit: 'length', rate: 19.00, section: 'ROOF COVERINGS' },
  { code: 'D4*1.111111111', description: '38*38mm*6m', unit: 'length', rate: 6.00, section: 'ROOF COVERINGS' },
  { code: 'D4*0.263374486', description: '152*38mm *6m beams', unit: 'length', rate: 14.0, section: 'ROOF COVERINGS' },
  { code: 'D4*1.04526749', description: '114*38mm*6m beams', unit: 'length', rate: 12.00, section: 'ROOF COVERINGS' },
  { code: 'A4/3', description: 'A.C Fascia Board', unit: 'NO', rate: 16.50, section: 'ROOF COVERINGS' },
  // { code: 'D4*1.111111111', description: 'DPC 9 inch ', unit: 'length', rate: 6.0, section: 'ROOF COVERINGS' },
  // { code: 'D4*0.263374486', description: 'Valley gutters   2.4m', unit: 'length', rate: 14.0, section: 'ROOF COVERINGS' },

  // LABOUR — SUB-STRUCTURE (LABOUR block A61..G61)
  { code: 'H6', description: 'Site clearance', unit: 'm2', rate: 0.20, section: 'FOUNDATIONS', itemType: 'LABOUR' },
  { code: 'D4', description: 'Setting out', unit: 'm2', rate: 0.70, section: 'FOUNDATIONS', itemType: 'LABOUR' },
  { code: 'J6', description: 'Excavation to pickable earth (≤ 2m depth)', unit: 'm', rate: 4.50, section: 'FOUNDATIONS', itemType: 'LABOUR' },
  { code: 'K6', description: 'Concrete works (footings and surface beds)', unit: 'm3', rate: 20.00, section: 'FOUNDATIONS', itemType: 'LABOUR' },
  { code: 'L6', description: 'Footing brickwork in foundation', unit: 'm2', rate: 4.50, section: 'FOUNDATIONS', itemType: 'LABOUR' },
  { code: 'M6', description: 'Ramming and backfilling', unit: 'm3', rate: 4.00, section: 'FOUNDATIONS', itemType: 'LABOUR' },
  { code: 'N6', description: 'Floor slab (100mm, 1:2:4)', unit: 'm3', rate: 20.00, section: 'FOUNDATIONS', itemType: 'LABOUR' },

  // SUPER STRUCTURE TO RING BEAM
  { code: 'H12-80', description: 'Brickwork', unit: 'm2', rate: 4.50, section: 'SUPERSTRUCTURE BRICKWORK', itemType: 'LABOUR' },
  { code: 'D54+C54', description: 'Door Frame Fittings', unit: 'no', rate: 5.50, section: 'SUPERSTRUCTURE BRICKWORK', itemType: 'LABOUR' },

  // ABOVE RING BEAM
  { code: 'L12-50', description: 'Brickwork', unit: 'm2', rate: 4.50, section: 'SUPERSTRUCTURE BRICKWORK', itemType: 'LABOUR' },
  { code: 'K12', description: 'Shuttering', unit: 'm2', rate: 25.00, section: 'SUPERSTRUCTURE BRICKWORK', itemType: 'LABOUR' },
  { code: 'L12-500', description: 'Steel fixing', unit: 'kgs', rate: 3.00, section: 'SUPERSTRUCTURE BRICKWORK', itemType: 'LABOUR' },
  { code: 'J12', description: 'Ring beam and column concrete mixing', unit: 'm3', rate: 15, section: 'SUPERSTRUCTURE BRICKWORK', itemType: 'LABOUR' },
  { code: 'H15', description: 'Beam filing', unit: 'm2', rate: 12.50, section: 'SUPERSTRUCTURE BRICKWORK', itemType: 'LABOUR' },

  //BEAM FILLING
  { code: 'H15', description: 'Brickwork above the wallplate laid in stretcher bond PC cement, laid in 1:4 cement mortar and make good.', unit: 'm2', rate: 12.50, section: 'superstructure brickwork'.toUpperCase() },

  // SCREED
  { code: 'D4+40', description: '40mm screed to receive floor finishes', unit: 'm2', rate: 4.50, section: 'SCREEDS', itemType: 'LABOUR' },

  //TUBING AND CHOPPING
  //  { code: 'C29', description: 'Supply, install and commission of conduit fittings required and all necessary accessories and fittings to complete the work as specified.', unit: 'item', rate: 650.0, section: 'ELECTRICALS TUBING' },

  // ROOFING
  { code: 'D4/1.7', description: 'Roof truss', unit: 'no', rate: 12.50, section: 'ROOF COVERINGS', itemType: 'LABOUR' },
  { code: 'A4/3*3.6', description: 'Facia board', unit: 'm', rate: 1.50, section: 'ROOF COVERINGS', itemType: 'LABOUR' },
  { code: 'D4*1.5', description: 'Roof Coverings', unit: 'm2', rate: 4.50, section: 'ROOF COVERINGS', itemType: 'LABOUR' },
  //{ code: 'D4*1.5', description: 'Extra over roll top ridges', unit: 'no', rate: 1.00, section: 'ROOFING' },


];

// Electrical items that can be optionally included during quote creation.
// These are NOT computed from takeoff cells — they are fixed catalog items with editable qty/rate.
export type ElectricalItem = {
  id: string;
  description: string;
  unit: string;
  rate: number;
  qty: number;
  section: string;
  itemType: 'MATERIAL' | 'LABOUR';
};

export const ELECTRICAL_ITEMS_CATALOG: ElectricalItem[] = [
  // DISTRIBUTION BOARDS
  { id: 'elec-1',  description: '8-10Way DB Flush mounting',       unit: 'no',   rate: 25.00,  qty: 0, section: 'ELECTRICALS', itemType: 'MATERIAL' },
  { id: 'elec-2',  description: 'Single phase meterbox',           unit: 'no',   rate: 35.00,  qty: 0, section: 'ELECTRICALS', itemType: 'MATERIAL' },
  // SWITCHES AND ACCESSORIES
  { id: 'elec-3',  description: '25mm Conduits',                   unit: 'no',   rate: 4.00,   qty: 0, section: 'ELECTRICALS', itemType: 'MATERIAL' },
  { id: 'elec-4',  description: '25mm PVC Couplings',              unit: 'no',   rate: 0.20,   qty: 0, section: 'ELECTRICALS', itemType: 'MATERIAL' },
  { id: 'elec-5',  description: '25mm PVC Nipples',                unit: 'no',   rate: 0.10,   qty: 0, section: 'ELECTRICALS', itemType: 'MATERIAL' },
  { id: 'elec-6',  description: '19mm Conduits (6m lengths)',      unit: 'no',   rate: 2.10,   qty: 0, section: 'ELECTRICALS', itemType: 'MATERIAL' },
  { id: 'elec-7',  description: '19mm PVC Couplings',              unit: 'no',   rate: 0.15,   qty: 0, section: 'ELECTRICALS', itemType: 'MATERIAL' },
  { id: 'elec-8',  description: '19mm PVC Nipples',                unit: 'no',   rate: 0.20,   qty: 0, section: 'ELECTRICALS', itemType: 'MATERIAL' },
  { id: 'elec-9',  description: 'Saddles (19mm)',                  unit: 'no',   rate: 0.15,   qty: 0, section: 'ELECTRICALS', itemType: 'MATERIAL' },
  { id: 'elec-10', description: '4.0x35mm wood screws',            unit: 'box',  rate: 5.00,   qty: 0, section: 'ELECTRICALS', itemType: 'MATERIAL' },
  { id: 'elec-11', description: 'Saddles (25mm)',                  unit: 'no',   rate: 0.15,   qty: 0, section: 'ELECTRICALS', itemType: 'MATERIAL' },
  { id: 'elec-12', description: 'B.E conduit',                    unit: 'no',   rate: 15.00,  qty: 0, section: 'ELECTRICALS', itemType: 'MATERIAL' },
  { id: 'elec-13', description: 'B.E coupling',                   unit: 'no',   rate: 1.50,   qty: 0, section: 'ELECTRICALS', itemType: 'MATERIAL' },
  { id: 'elec-14', description: 'B.E saddles',                    unit: 'no',   rate: 0.50,   qty: 0, section: 'ELECTRICALS', itemType: 'MATERIAL' },
  { id: 'elec-15', description: 'Surface boxes, 6x3',             unit: 'no',   rate: 2.00,   qty: 0, section: 'ELECTRICALS', itemType: 'MATERIAL' },
  { id: 'elec-16', description: 'Surface boxes, 3x3',             unit: 'no',   rate: 1.50,   qty: 0, section: 'ELECTRICALS', itemType: 'MATERIAL' },
  { id: 'elec-17', description: 'Round boxes',                    unit: 'no',   rate: 0.90,   qty: 0, section: 'ELECTRICALS', itemType: 'MATERIAL' },
  { id: 'elec-18', description: 'Solvent cement 500ml',           unit: 'no',   rate: 10.00,  qty: 0, section: 'ELECTRICALS', itemType: 'MATERIAL' },
  { id: 'elec-19', description: 'Clout nails',                    unit: 'kgs',  rate: 8.00,   qty: 0, section: 'ELECTRICALS', itemType: 'MATERIAL' },
  { id: 'elec-20', description: '25mm female brass bush',         unit: 'no',   rate: 1.50,   qty: 0, section: 'ELECTRICALS', itemType: 'MATERIAL' },
  { id: 'elec-21', description: '19mm female bushes',             unit: 'no',   rate: 1.50,   qty: 0, section: 'ELECTRICALS', itemType: 'MATERIAL' },
  { id: 'elec-22', description: '25mm PVC to steel adapter',      unit: 'no',   rate: 3.90,   qty: 0, section: 'ELECTRICALS', itemType: 'MATERIAL' },
  { id: 'elec-23', description: '6mm extension bolts',            unit: 'no',   rate: 1.00,   qty: 0, section: 'ELECTRICALS', itemType: 'MATERIAL' },
  { id: 'elec-24', description: 'Angle iron',                     unit: 'no',   rate: 5.00,   qty: 0, section: 'ELECTRICALS', itemType: 'MATERIAL' },
  { id: 'elec-25', description: 'D Iron and schuckle',            unit: 'no',   rate: 6.00,   qty: 0, section: 'ELECTRICALS', itemType: 'MATERIAL' },
  { id: 'elec-26', description: 'Goose Neck pipe',                unit: 'no',   rate: 10.00,  qty: 0, section: 'ELECTRICALS', itemType: 'MATERIAL' },
  { id: 'elec-27', description: 'Chasing combs',                  unit: 'no',   rate: 0.50,   qty: 0, section: 'ELECTRICALS', itemType: 'MATERIAL' },
  // LABOUR
  { id: 'elec-28', description: 'Tubing and chopping labour',     unit: 'item', rate: 650.00, qty: 0, section: 'ELECTRICALS', itemType: 'LABOUR' },
];

