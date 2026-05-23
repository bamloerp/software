import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { QUOTE_LINE_MAP } from '@/lib/quoteMap';
import { TAKEOFF_DEFAULTS, TAKEOFF_LAYOUT } from '@/lib/takeoffLayout';

export const runtime = 'nodejs';

// --- helpers ---
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Resolve single or composite code like "A36+A25" by summing the parts from context. */
function resolveQty(context: Record<string, unknown>, code: string): number {
  return code
    .split('+')
    .map(s => s.trim())
    .filter(Boolean)
    .reduce((sum, c) => sum + num(context[c]), 0);
}

function varsInExpr(expr: string): string[] {
  return Array.from(new Set(expr.toUpperCase().match(/[A-Z][A-Z0-9_]*/g) ?? []));
}

function evaluateTakeoffLayout(base: Record<string, number>) {
  const context: Record<string, number> = { ...TAKEOFF_DEFAULTS, ...base };
  const evaluated = new Map<string, { code: string; value: number; expression: string; dependsOn: string[] }>();

  let safety = 0;
  let progressed = true;
  while (progressed && safety++ < 120) {
    progressed = false;
    for (const row of TAKEOFF_LAYOUT) {
      if (row.type !== 'cells') continue;
      for (const cell of row.cells) {
        if (!cell || cell.kind !== 'calc' || !cell.expr) continue;
        const dependsOn = varsInExpr(cell.expr);
        const canEval = dependsOn.every((code) => code in context && Number.isFinite(Number(context[code])));
        if (!canEval) continue;

        const value = evalExpr(context, cell.expr);
        if (!Number.isFinite(value)) continue;

        if (context[cell.code] !== value) {
          context[cell.code] = value;
          progressed = true;
        }
        evaluated.set(cell.code, { code: cell.code, value, expression: cell.expr, dependsOn });
      }
    }
  }

  return { context, evaluated: Array.from(evaluated.values()) };
}

// --- tiny expression engine (supports A1, B22, numbers, + - * / and parentheses) ---
type Ctx = Record<string, unknown>;
const toNum = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Tokenize: identifiers, numbers, operators, parentheses
function tokenize(expr: string): string[] {
  const tokens: string[] = [];
  const re = /\s*([A-Za-z]\w*|\d*\.?\d+|[()+\-*/])\s*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(expr)) !== null) tokens.push(m[1]);
  return tokens;
}

// Shunting-yard to RPN (handles unary minus)
function toRPN(tokens: string[]): string[] {
  const out: string[] = [];
  const ops: string[] = [];
  const prec: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };
  const rightAssoc = new Set<string>(); // all left-assoc
  let prev: string | null = null;

  for (const t of tokens) {
    const isNumber = /^(\d*\.?\d+)$/.test(t);
    const isIdent  = /^[A-Za-z]\w*$/.test(t);

    if (isNumber || isIdent) {
      out.push(t);
    } else if (t === '(') {
      ops.push(t);
    } else if (t === ')') {
      while (ops.length && ops[ops.length - 1] !== '(') out.push(ops.pop()!);
      ops.pop(); // drop '('
    } else if ('+-*/'.includes(t)) {
      // unary minus -> treat as 0 - x
      const unaryMinus = (t === '-') && (prev === null || '()+-*/'.includes(prev));
      if (unaryMinus) out.push('0');
      while (
        ops.length &&
        ops[ops.length - 1] !== '(' &&
        (prec[ops[ops.length - 1]] > prec[t] ||
          (prec[ops[ops.length - 1]] === prec[t] && !rightAssoc.has(t)))
      ) {
        out.push(ops.pop()!);
      }
      ops.push(t);
    } else {
      // ignore unknown
    }
    prev = t;
  }
  while (ops.length) out.push(ops.pop()!);
  return out;
}

// Evaluate RPN against context (identifiers read from context, missing=0)
function evalRPN(rpn: string[], ctx: Ctx): number {
  const st: number[] = [];
  for (const t of rpn) {
    if (/^\d*\.?\d+$/.test(t)) st.push(Number(t));
    else if (/^[A-Za-z]\w*$/.test(t)) st.push(toNum(ctx[t]));
    else {
      const b = st.pop() ?? 0;
      const a = st.pop() ?? 0;
      switch (t) {
        case '+': st.push(a + b); break;
        case '-': st.push(a - b); break;
        case '*': st.push(a * b); break;
        case '/': st.push(b === 0 ? 0 : a / b); break;
        default:  st.push(0);
      }
    }
  }
  return st.pop() ?? 0;
}

function evalExpr(ctx: Ctx, expr: string): number {
  const rpn = toRPN(tokenize(expr));
  const val = evalRPN(rpn, ctx);
  return Number.isFinite(val) ? val : 0;
}


export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const inputs: Record<string, number> = body?.inputs || {};
    const label: string = body?.label || 'takeoff';

    const { context, evaluated } = evaluateTakeoffLayout(inputs);

    // Build workbook
    const wb = XLSX.utils.book_new();

    // Sheet 1: Take Off (all values + expressions if present)
    const takeoffRows = [
      ['Code', 'Value', 'Expression', 'DependsOn'],
      ...evaluated.map((e) => [e.code, num((context as any)[e.code]), e.expression || '', (e.dependsOn || []).join(', ')]),
    ];
    const wsTake = XLSX.utils.aoa_to_sheet(takeoffRows);
    XLSX.utils.book_append_sheet(wb, wsTake, 'Take Off');

    // Sheet 2: Quote Preview (mapped items)
    // const previewRows: any[][] = [['Description', 'Unit', 'Qty', 'Rate']];
    // for (const m of QUOTE_LINE_MAP) {
    //   //const qty = Number(context[m.code] ?? 0);
    //   const qty = resolveQty(context as any, m.code);
    //   //if (!Number.isFinite(qty)) continue;
    //    if (qty <= 0) continue; 
    //    const rate = num(m.rate);
    //   const amount = qty * rate;
    //  // previewRows.push([m.description, m.unit || '', qty, m.rate ?? 0]);
    //  previewRows.push([m.description, m.unit || '', qty, rate, amount]);
    // }
// Sheet 2: Quote Preview (mapped items)
const previewRows: any[][] = [['Description', 'Unit', 'Qty', 'Rate', 'Amount']];
for (const m of QUOTE_LINE_MAP) {
  const qty = evalExpr(context as any, m.code);   // <-- now handles + - * / and literals
  if (!(qty > 0)) continue;                       // skip zero if desired
  const rate = Number(m.rate ?? 0);
  const amount = qty * rate;
  previewRows.push([m.description, m.unit || '', qty, rate, amount]);
}



    const wsPreview = XLSX.utils.aoa_to_sheet(previewRows);
    XLSX.utils.book_append_sheet(wb, wsPreview, 'Quote Preview');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${label}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Failed to export takeoff' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

