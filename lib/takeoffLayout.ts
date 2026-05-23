export type SheetCell = {
  code: string; // e.g., A4, C4, D12
  label: string;
  kind: 'input' | 'calc';
  expr?: string; // for calc cells (expr-eval syntax with codes)
};

export type SheetRow =
  | { type: 'heading'; title: string }
  | { type: 'subheading'; title: string }
  | { type: 'cells'; cells: (SheetCell | null)[] };

export const SHEET_COLUMNS = 7; // matches your screenshot (A..G)

export const TAKEOFF_DEFAULTS: Record<string, number> = {
  A2: 3000,
  B2: 0.6,
  C2: 0.6,
  D2: 100,
  E2: 15,
  A21: 24,
};

export const TAKEOFF_LAYOUT: SheetRow[] = [
  { type: 'heading', title: 'MATERIALS' },
  { type: 'subheading', title: 'FOUNDATION' },
  {
    type: 'cells',
    cells: [
      { code: 'A2', label: 'Truck capacity (bricks/trip)', kind: 'input' },
      { code: 'B2', label: 'Trench width (m)', kind: 'input' },
      { code: 'C2', label: 'Trench depth (m)', kind: 'input' },
      { code: 'D2', label: 'Cement bags per load', kind: 'input' },
      { code: 'E2', label: 'Number of courses', kind: 'input' },
      null,
      null,
    ],
  },
  // Row 1
  {
    type: 'cells',
    cells: [
      { code: 'A4', label: 'One Brick wall', kind: 'input' },
      { code: 'B4', label: 'Half Brick Wall', kind: 'input' },
      { code: 'C4', label: 'Total Perimeter', kind: 'calc', expr: 'A4 + B4' },
      { code: 'D4', label: 'Total Area', kind: 'input' },
      { code: 'E4', label: 'VERANDER', kind: 'input' },
      { code: 'F4', label: 'Topsoil Excav', kind: 'calc', expr: 'D4 * 0.4' },
      { code: 'G4', label: 'PROJECT DISTANCE', kind: 'input' },
    ],
  },
  // Row 2
  {
    type: 'cells',
    cells: [
      { code: 'A7', label: 'Excavation', kind: 'calc', expr: 'C4 * B2 * C2' },
      { code: 'B7', label: 'River Sand', kind: 'calc', expr: 'D12 + F12' },
      { code: 'C7', label: 'Pit Sand', kind: 'calc', expr: 'E12 * 3' },
      { code: 'D7', label: 'Concrete', kind: 'calc', expr: 'D12 + F12' },
      { code: 'E7', label: '230mm Brickforce', kind: 'calc', expr: 'A4 / E2 * 3' },
      { code: 'F7', label: '115mm Brickforce', kind: 'calc', expr: 'B4 / E2 * 3' },
      { code: 'G7', label: 'Gravel', kind: 'calc', expr: 'C4 * 0.5' },
      { code: 'B8', label: '', kind: 'calc', expr: 'B7 * 2 / 8' },
      { code: 'C8', label: '', kind: 'calc', expr: 'C7 / 8' },
      { code: 'D8', label: '', kind: 'calc', expr: 'D7 * 2 / 8' },
    ],
  },
  // BRICKS block
  {
    type: 'cells',
    cells: [
      { code: 'A12', label: 'BRICKS\n230 wall', kind: 'calc', expr: 'A4 / 0.23 * 2 * E2' },
      { code: 'B12', label: '115 wall', kind: 'calc', expr: 'B4 / 0.23 * E2' },
      null,
      { code: 'D12', label: 'CEMENT\nFooting', kind: 'calc', expr: 'C4 * 0.23 * B2 * 3' },
      { code: 'E12', label: 'Brick work', kind: 'calc', expr: 'A15 / 250' },
      { code: 'F12', label: 'Slab', kind: 'calc', expr: 'D4 * 0.1 * 3' },
      { code: 'G12', label: 'Termite Poisan', kind: 'calc', expr: 'D4 / 10' },
    ],
  },
  // Totals row
  {
    type: 'cells',
    cells: [
      { code: 'A15', label: 'TOTAL BRICKS', kind: 'calc', expr: 'A12 + B12' },
      { code: 'B15', label: 'BRICKS T/TRIPS', kind: 'calc', expr: 'A15 / A2' },
      { code: 'C15', label: 'CEMENT T/TRIPS', kind: 'calc', expr: 'G15 / D2' },
      /* { code: 'B16', label: '', kind: 'calc', expr: 'G4 * B15' },
      { code: 'C16', label: '', kind: 'calc', expr: 'C15 * G4' }, */
      { code: 'D16', label: 'TOTAL TRIPS', kind: 'calc', expr: 'B16 + C16' },
      null,
      null,
      // Algebraic resolution to avoid circular dependency with D12,B16,C16,C15
      // G15 = D12 + E12 + F12, D12 = B16 + C16, B16 = G4*(A15/A2), C16 = (G15/100)*G4
      // => G15 = G4*(A15/A2) + G4*(G15/100) + E12 + F12
      // => G15 * (1 - G4/100) = G4*(A15/A2) + E12 + F12
      // => G15 = (G4*(A15/A2) + E12 + F12) / (1 - G4/100)
      { code: 'G15', label: 'TOTAL CEMENT', kind: 'calc', expr: 'D12+E12+F12' },
    ],
  },
  // Trips detail row (distance-multiplied)
  {
    type: 'cells',
    cells: [
      null,
      { code: 'B16', label: 'BRICKS TRIPS x DIST', kind: 'calc', expr: 'G4 * B15' },
      { code: 'C16', label: 'CEMENT TRIPS x DIST', kind: 'calc', expr: 'C15 * G4' },
      null,
      null,
      null,
      null,
    ],
  },
  // SUPERSTRUCTURE
  { type: 'subheading', title: 'SUPERSTRURE' },
  {
    type: 'cells',
    cells: [
      { code: 'A21', label: 'Superstructure height', kind: 'input' },
      null,
      null,
      null,
      null,
      null,
      null,
    ],
  },
  {
    type: 'cells',
    cells: [
      { code: 'A22', label: 'BRICKS to Ringbeam\n230 wall', kind: 'calc', expr: 'A4 / 0.23 * 2 * A21' },
      { code: 'B22', label: '115 wall', kind: 'calc', expr: 'B4 / 0.23 * A21' },
      null,
      { code: 'D22', label: 'CEMENT\nBrick work', kind: 'calc', expr: 'A25 / 250' },
      { code: 'E22', label: 'Inter Plastering', kind: 'calc', expr: 'F25 / 7' },
      { code: 'F22', label: 'Ext Plastering', kind: 'calc', expr: 'E25 / 8' },
      { code: 'G22', label: 'Ring Beam', kind: 'calc', expr: 'A4 * 0.23 * 0.23 * 4' },
    ],
  },
  {
    type: 'cells',
    cells: [
      { code: 'A25', label: 'TOTAL', kind: 'calc', expr: 'A22 + B22' },
      null,
      null,
      { code: 'D25', label: 'Floors', kind: 'calc', expr: 'D4 * 0.05 * 8' },
      { code: 'E25', label: 'Ext Walls Area m2', kind: 'calc', expr: 'A22 / 48 / 2' },
      { code: 'F25', label: 'Inter Walls Area m2', kind: 'calc', expr: 'B22 / 48 * 2 + E25' },
      null,
    ],
  },

  // ---- CONTINUATION (image 2) ----
  // { type: 'subheading', title: 'BRICKS T/TRIPS • CEMENT T/TRIPS • TOTAL TRIPS' },
  {
    type: 'cells',
    cells: [
      { code: 'A28', label: 'BRICKS T/TRIPS', kind: 'calc', expr: 'A25 / A2' },
      { code: 'B28', label: 'CEMENT T/TRIPS', kind: 'calc', expr: 'G28 / 100' },
      { code: 'C28', label: 'TOTAL TRIPS', kind: 'calc', expr: 'A28 + B28' },
      null,
      { code: 'G28', label: 'TOTAL CEMENT', kind: 'calc', expr: 'D22 + E22 + F22 + G22 + D25' },
      { code: 'A29', label: '', kind: 'calc', expr: 'A28 * G4' },
      { code: 'B29', label: '', kind: 'calc', expr: 'G4 * B28' },
      { code: 'C29', label: '', kind: 'calc', expr: 'A29 + B29 + C40' },
    ],
  },
  // { type: 'subheading', title: 'BRICKS Above Ringbeam /t/t/t/t Cement' },
  {
    type: 'cells',
    cells: [
      { code: 'A33', label: '230 wall', kind: 'calc', expr: 'A4 / 0.23 * 2 * 8' },
      { code: 'B33', label: '115 wall', kind: 'calc', expr: 'B4 / 0.23 * 7' },
      { code: 'D33', label: 'Brick Work', kind: 'calc', expr: 'A36 / 250' },
      { code: 'E33', label: 'Inter Plastering', kind: 'calc', expr: 'F36 / 8' },
      { code: 'F33', label: 'Ext Plastering', kind: 'calc', expr: 'E36 / 6' },
      null,
      { code: 'A36', label: '', kind: 'calc', expr: 'A33 + B33' },
      { code: 'B36', label: 'CEMENT TOTAL', kind: 'calc', expr: 'D22 + D33' },
      { code: 'E36', label: 'Ext Walls Area m2', kind: 'calc', expr: 'A33 / 48 / 2' },
      { code: 'F36', label: 'Inter Walls Area m^2', kind: 'calc', expr: 'B33 / 48 * 2 + E36' },
      null,
    ],
  },
  {
    type: 'cells',
    cells: [
      { code: 'A39', label: 'BRICKS T/TRIPS', kind: 'calc', expr: 'A36 / A2' },
      { code: 'B39', label: 'CEMENT T/TRIPS', kind: 'calc', expr: 'B36 / D2' },
      { code: 'C36', label: 'TOTAL TRIPS', kind: 'calc', expr: 'A39 * B39' },
      { code: 'A40', label: '', kind: 'calc', expr: 'G4 * A39' },
      { code: 'B40', label: '', kind: 'calc', expr: 'G4 * B39' },
      { code: 'C40', label: 'TOTAL TRIPS 2', kind: 'calc', expr: 'A40 + B40' },
      null,
      null,
      null,
    ],
  },
  // { type: 'subheading', title: 'AGGREGATES — BRICK WORK' },
  {
    type: 'cells',
    cells: [
      { code: 'A45', label: 'River Sand', kind: 'calc', expr: 'G22 * 2 / 8' },
      { code: 'B45', label: 'Pit Sand', kind: 'calc', expr: 'B36 * 3 / 8' },
      { code: 'C45', label: 'Concrete', kind: 'calc', expr: 'G22 * 2 / 8' },
      { code: 'D45', label: '12mm D/Bars', kind: 'calc', expr: 'A4 / 5 * 4' },
      { code: 'E45', label: '10mm D/Bars', kind: 'calc', expr: '(A4 / 0.2) * 0.85 / 5' },
      { code: 'F45', label: '230mm Brick Force', kind: 'calc', expr: 'A4 / 15 * 8' },
      { code: 'G45', label: '11mm Brick Force', kind: 'calc', expr: 'B4 / 15 * 8' },
      { code: 'D48', label: '16mm D/Bars', kind: 'calc', expr: 'E4 / 5 * 4' },
    ],
  },
  { type: 'subheading', title: 'PLASTERING' },
  {
    type: 'cells',
    cells: [
      { code: 'A51', label: 'Pit Sand Internal', kind: 'calc', expr: 'E22 + E33' },
      { code: 'B51', label: 'Rhinoset', kind: 'calc', expr: 'F25 / 15' },
      { code: 'C51', label: 'Floors River Sand', kind: 'calc', expr: 'D25 * 3 / 8' },
      { code: 'D51', label: 'Pit Sand External', kind: 'calc', expr: 'F22 + F33' },
      { code: 'A52', label: '', kind: 'calc', expr: 'A51 * 3 / 8' },
      { code: 'D52', label: '', kind: 'calc', expr: 'D51 * 3 / 8' },
      { code: 'A54', label: '115 mm DPC', kind: 'calc', expr: 'B4 / 10' },
      { code: 'B54', label: '230mm DPC', kind: 'calc', expr: 'A4 / 15' },
      { code: 'G51', label: 'Internal Airvents', kind: 'input' },
      { code: 'H51', label: 'External Airvents', kind: 'input' },
    ],
  },
  {
    type: 'cells',
    cells: [
      { code: 'C54', label: '230mm D/Frames', kind: 'input' },
      { code: 'D54', label: '115mm D/Frames', kind: 'input' },
      { code: 'E54', label: 'Burnt Wire', kind: 'calc', expr: 'D45 / 5' },
      { code: 'F54', label: 'Lindles D/Bars', kind: 'calc', expr: 'D54 / 0.2 * 0.6 / 6' },
      null,
      null,
      null,
      null,
    ],
  },

  // ---- LABOUR SHEET ----
  { type: 'heading', title: 'LABOUR' },
  { type: 'subheading', title: 'FOUNDATION' },
  {
    type: 'cells',
    cells: [
      { code: 'H6', label: 'Site Clearance', kind: 'calc', expr: 'D4 + A4' },
      { code: 'I6', label: 'Setting Out', kind: 'calc', expr: 'C4' },
      { code: 'J6', label: 'Excavation', kind: 'calc', expr: 'C4' },
      { code: 'K6', label: 'Footing Concrete', kind: 'calc', expr: 'C4 * B2 * 0.23' },
      { code: 'L6', label: 'Footing Brick work', kind: 'calc', expr: 'A15 / 48' },
      { code: 'M6', label: 'B/Filling & Raming', kind: 'calc', expr: 'G7' },
      { code: 'N6', label: 'Concrete Slab', kind: 'calc', expr: 'D4 * 0.1' },
    ],
  },
  { type: 'subheading', title: 'SUPER STRUCTURE' },
  {
    type: 'cells',
    cells: [
      { code: 'H12', label: 'B/Work to Ring Beam', kind: 'calc', expr: 'A25 / 48' },
      { code: 'I12', label: 'Above Ring Beam', kind: 'calc', expr: 'A36 / 48' },
      { code: 'J12', label: 'Ring Concrete', kind: 'calc', expr: 'G22 * 3 / 11' },
      { code: 'K12', label: 'Shuttering', kind: 'calc', expr: 'C4' },
      { code: 'L12', label: 'Steel fixing', kind: 'calc', expr: '(D45 + E45 + F54) * 6' },
      { code: 'M12', label: 'W/Frame Fitting', kind: 'input' },
      { code: 'N12', label: 'D/Frame fitting', kind: 'calc', expr: 'C54 + D54' },
    ],
  },
  {
    type: 'cells',
    cells: [
      { code: 'H15', label: 'Beam Filling', kind: 'calc', expr: 'A4 * 0.345' },
      null,
      null,
      null,
      null,
      null,
      null,
    ],
  },
  { type: 'subheading', title: 'PLASTERING' },
  {
    type: 'cells',
    cells: [
      { code: 'H22', label: 'Inter Plastering', kind: 'calc', expr: 'F25 + F36' },
      { code: 'I22', label: 'Ext Plastering', kind: 'calc', expr: 'E25 + E36' },
      { code: 'J22', label: 'Floors', kind: 'calc', expr: 'D4' },
      null,
      null,
      null,
      null,
    ],
  },

  // ---- AUXILIARY INPUTS (to allow manual entry for referenced codes) ----
  /* { type: 'subheading', title: 'AUX INPUTS (manual if needed)' },
  { type: 'cells', cells: [
    { code: 'B15', label: 'B15 (manual)', kind: 'input' },
    { code: 'A25', label: 'A25 (manual)', kind: 'input' },
    { code: 'B25', label: 'B25 (manual)', kind: 'input' },
    { code: 'D25', label: 'D25 (manual)', kind: 'input' },
    { code: 'E25', label: 'E25 (manual)', kind: 'input' },
    { code: 'F25', label: 'F25 (manual)', kind: 'input' },
  ] },
  { type: 'cells', cells: [
    { code: 'A36', label: 'A36 (manual)', kind: 'input' },
    { code: 'B36', label: 'B36 (manual)', kind: 'input' },
    { code: 'A39', label: 'A39 (manual)', kind: 'input' },
    { code: 'B39', label: 'B39 (manual)', kind: 'input' },
    { code: 'A40', label: 'A40 (manual)', kind: 'input' },
    { code: 'B40', label: 'B40 (manual)', kind: 'input' },
    { code: 'G22', label: 'G22 (manual)', kind: 'input' },
  ] },
  { type: 'cells', cells: [
    { code: 'E36', label: 'E36 (manual)', kind: 'input' },
    { code: 'F36', label: 'F36 (manual)', kind: 'input' },
    { code: 'D45', label: 'D45 (manual)', kind: 'input' },
    { code: 'E45', label: 'E45 (manual)', kind: 'input' },
    { code: 'F54', label: 'F54 (manual)', kind: 'input' },
    { code: 'C54', label: 'C54 (manual)', kind: 'input' },
    { code: 'D54', label: 'D54 (manual)', kind: 'input' },
  ] },
  { type: 'cells', cells: [
    { code: 'E33', label: 'E33 (manual)', kind: 'input' },
    { code: 'F33', label: 'F33 (manual)', kind: 'input' },
    { code: 'D51', label: 'D51 (manual)', kind: 'input' },
    { code: 'E12', label: 'E12 (manual)', kind: 'input' },
    { code: 'F12', label: 'F12 (manual)', kind: 'input' },
    { code: 'A28', label: 'A28 (manual)', kind: 'input' },
    { code: 'A29', label: 'A29 (manual)', kind: 'input' },
    { code: 'B29', label: 'B29 (manual)', kind: 'input' },
    { code: 'C40', label: 'C40 (manual)', kind: 'input' },
    null,
  ] }, */
];
