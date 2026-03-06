# Formula Comparison Report

- Excel file: `TABANA.xlsx`
- Selected worksheet for comparison: **Take Off**
- takeoff formulas found: **92**
- excel formulas found in selected sheet: **104**
- excel formulas found across workbook: **2267**
- quoteMap entries found: **61**

## takeoffLayout.ts vs TABANA.xlsx (same cell code)

- Matched formulas: **71**
- Mismatched formulas: **15**
- In takeoff only (no Excel formula in same cell): **6**
- In Excel only (no takeoff formula for same cell): **18**

### Mismatched

| Cell | takeoffLayout.ts | TABANA.xlsx |
|---|---|---|
| `A22` | `A4 / 0.23 * 2 * 24` | `A4/0.23*2*26` |
| `A28` | `A25 / A2` | `A25/5000` |
| `A39` | `A36 / A2` | `A36/5000` |
| `B15` | `A15 / A2` | `A15/5000` |
| `B22` | `B4 / 0.23 * 24` | `B4/0.23*26` |
| `B28` | `G28 / 100` | `G28/140` |
| `B39` | `B36 / D2` | `B36/140` |
| `B8` | `B7 * 2 / 11` | `B7*2/8` |
| `C15` | `G15 / D2` | `G15/140` |
| `D12` | `C4 * 0.23 * B2 * 3` | `C4*0.23*0.7*3` |
| `D8` | `D7 * 2 / 11` | `D7*2/8` |
| `E25` | `A22 / 48 / 2` | `A22/96` |
| `F54` | `D54 / 0.2 * 0.6 / 6` | `E45/5` |
| `H6` | `D4 + A4` | `+D4+A4` |
| `K6` | `C4 * B2 * 0.23` | `C4*0.7*0.23` |

### takeoff-only formula cells

`A2`, `C36`, `D4`, `G4`, `G51`, `M12`

### Excel-only formula cells

`A7`, `A73`, `B10`, `B20`, `B31`, `B73`, `C39`, `C4`, `C69`, `C73`, `D73`, `E73`, `F4`, `G54`, `G73`, `G74`, `J4`, `N12`

## quoteMap.ts code expressions checks

- Entries with unresolved cell references: **0**

