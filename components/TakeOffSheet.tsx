'use client';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Parser } from 'expr-eval';
import { TAKEOFF_DEFAULTS, TAKEOFF_LAYOUT } from '@/lib/takeoffLayout';
import { createQuote, saveTakeoffQuoteDraft, upsertCustomer } from '@/app/(protected)/actions';
import { QUOTE_LINE_MAP, ELECTRICAL_ITEMS_CATALOG, type ElectricalItem } from '@/lib/quoteMap';
import { normalizeContext, missingVars, evalExpr } from '@/lib/expr';
import { DEFAULT_NOTES } from '@/lib/quoteDefaults';
import { manualRateCode, type ManualCatalogItem } from '@/lib/manualItemCatalogShared';
import ClearableNumberInput from './ClearableNumberInput';
import Money from '@/components/Money';
import { UserIcon, EnvelopeIcon, PhoneIcon, BuildingOfficeIcon, MapPinIcon, WrenchScrewdriverIcon, BeakerIcon, ArrowDownTrayIcon, PlusIcon, TrashIcon, CheckCircleIcon, BoltIcon, BookmarkSquareIcon } from '@heroicons/react/24/outline';

const parser = new Parser({ allowMemberAccess: false });

type UnitMap = Record<string, string>; // code -> unit label (optional)

function varsFromExpr(expr: string): string[] {
  try {
    const ast = parser.parse(expr as any);
    // @ts-ignore expr-eval exposes .variables()
    const v = typeof ast.variables === 'function' ? ast.variables() : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

type RateOverrides = Record<string, number>; // code -> overridden rate
type SystemSettings = { vatBps?: string; pgRate?: string; contingencyRate?: string };
type TakeoffDraft = {
  id?: string;
  customer?: Partial<{ name: string; email: string; phone: string; city: string; address: string }>;
  currency?: string;
  vatRate?: number;
  state?: {
    vals?: Record<string, number | null>;
    units?: UnitMap;
    customItems?: Array<Partial<CustomItem>>;
    notesText?: string;
    includeTiles?: boolean;
    includeElectricals?: boolean;
    electricalItems?: Array<Partial<ElectricalItem>>;
    constOverrides?: Record<string, Record<number, number>>;
  };
} | null;

type CustomItem = {
  catalogId?: string;
  description: string;
  unit: string;
  qty: number;
  rate: number;
  section: string;
  itemType?: 'MATERIAL' | 'LABOUR';
};

const BASE_TAKEOFF_VALUES = {
  ...TAKEOFF_DEFAULTS,
  A4: 0,
  B4: 0,
  D4: 0,
  E4: 0,
  G4: 0,
};

function restoreVals(draft?: TakeoffDraft): Record<string, number> {
  const restored: Record<string, number> = { ...BASE_TAKEOFF_VALUES };
  const vals = draft?.state?.vals ?? {};
  for (const [code, value] of Object.entries(vals)) {
    restored[code] = typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN;
  }
  return restored;
}

function restoreCustomItems(draft?: TakeoffDraft): CustomItem[] {
  const items = draft?.state?.customItems;
  if (!Array.isArray(items) || items.length === 0) {
    return [{ description: '', unit: '', qty: 0, rate: 0, section: 'FOUNDATIONS', itemType: 'MATERIAL' }];
  }
  return items.map((item) => ({
    catalogId: item.catalogId,
    description: item.description ?? '',
    unit: item.unit ?? '',
    qty: typeof item.qty === 'number' ? item.qty : 0,
    rate: typeof item.rate === 'number' ? item.rate : 0,
    section: item.section ?? 'FOUNDATIONS',
    itemType: item.itemType === 'LABOUR' ? 'LABOUR' : 'MATERIAL',
  }));
}

function sanitizeNumberMap(values: Record<string, number>): Record<string, number | null> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, Number.isFinite(value) ? value : null]),
  );
}

function attentionInputClass(needsAttention: boolean, className: string) {
  return needsAttention
    ? className.replace('border-gray-200', 'border-red-400').replace('dark:border-gray-600', 'dark:border-red-500') + ' bg-red-50 ring-2 ring-red-500/20 dark:bg-red-950/30'
    : className;
}

function applyElectricalRateOverrides(rateOverrides: RateOverrides): ElectricalItem[] {
  return ELECTRICAL_ITEMS_CATALOG.map(item => ({
    ...item,
    rate: rateOverrides[item.id] ?? item.rate,
  }));
}

export default function TakeOffSheet({
  rateOverrides = {},
  systemSettings = {},
  manualCatalog = [],
  initialDraft = null,
}: {
  rateOverrides?: RateOverrides;
  systemSettings?: SystemSettings;
  manualCatalog?: ManualCatalogItem[];
  initialDraft?: TakeoffDraft;
} = {}) {
  const [draftId, setDraftId] = useState(initialDraft?.id ?? '');
  const [vals, setVals] = useState<Record<string, number>>(() => restoreVals(initialDraft));
  const [tab, setTab] = useState<'materials' | 'labour'>('materials');
  const [units, setUnits] = useState<UnitMap>(() => initialDraft?.state?.units ?? {});
  const [customer, setCustomer] = useState({
    name: initialDraft?.customer?.name ?? '',
    email: initialDraft?.customer?.email ?? '',
    phone: initialDraft?.customer?.phone ?? '',
    city: initialDraft?.customer?.city ?? '',
  });
  const [customerAddress, setCustomerAddress] = useState(initialDraft?.customer?.address ?? '');
  const [currency, setCurrency] = useState(initialDraft?.currency || process.env.NEXT_PUBLIC_CURRENCY || 'USD');
  const defaultVat = systemSettings.vatBps ? Number(systemSettings.vatBps) / 10000 : parseFloat(process.env.VAT_DEFAULT || '0.155');
  const [vatRate, setVatRate] = useState<number>(typeof initialDraft?.vatRate === 'number' ? initialDraft.vatRate : defaultVat);
  const pgPct = systemSettings.pgRate ? Number(systemSettings.pgRate) / 100 : 0.02;
  const contingencyPct = systemSettings.contingencyRate ? Number(systemSettings.contingencyRate) / 100 : 0.10;
  const [creating, setCreating] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftMessage, setDraftMessage] = useState<string | null>(initialDraft?.id ? 'Draft loaded. Continue editing or generate when ready.' : null);
  const [showValidation, setShowValidation] = useState(false);
  const router = useRouter();
  const [customItems, setCustomItems] = useState<CustomItem[]>(() => restoreCustomItems(initialDraft));
  const [notesText, setNotesText] = useState(initialDraft?.state?.notesText ?? DEFAULT_NOTES);
  const [formError, setFormError] = useState<string | null>(null);

  // Tiles toggle (the 'Concrete tiles Double Roman black' item under ROOF COVERINGS)
  const [includeTiles, setIncludeTiles] = useState(initialDraft?.state?.includeTiles ?? true);

  // Electricals section
  const [includeElectricals, setIncludeElectricals] = useState(initialDraft?.state?.includeElectricals ?? false);
  const [electricalItems, setElectricalItems] = useState<ElectricalItem[]>(
    () => {
      const restored = initialDraft?.state?.electricalItems;
      if (Array.isArray(restored) && restored.length > 0) {
        return restored.map((item, idx) => ({
          id: item.id ?? `elec-draft-${idx}`,
          description: item.description ?? '',
          unit: item.unit ?? 'no',
          qty: typeof item.qty === 'number' ? item.qty : 0,
          rate: typeof item.rate === 'number' ? item.rate : 0,
          section: item.section ?? 'ELECTRICALS',
          itemType: item.itemType === 'LABOUR' ? 'LABOUR' : 'MATERIAL',
        }));
      }
      return applyElectricalRateOverrides(rateOverrides);
    }
  );


  // Per-cell numeric literal overrides, by literal index
  const [constOverrides, setConstOverrides] = useState<Record<string, Record<number, number>>>(initialDraft?.state?.constOverrides ?? {});
  const [editConst, setEditConst] = useState<{ code: string; index: number; value: string } | null>(
    null
  );

  // Find numeric literals that are not part of identifiers
  function findNumericLiterals(expr: string): { start: number; end: number; text: string }[] {
    const results: { start: number; end: number; text: string }[] = [];
    const re = /(\d+\.?\d*|\.\d+)/g; // 12, 12.34, .5
    let m: RegExpExecArray | null;
    while ((m = re.exec(expr))) {
      const start = m.index;
      const end = m.index + m[0].length;
      const before = expr[start - 1] || '';
      const after = expr[end] || '';
      const isPartOfIdent = /[A-Za-z_]/.test(before) || /[A-Za-z_]/.test(after);
      if (!isPartOfIdent) results.push({ start, end, text: m[0] });
    }
    return results;
  }

  const applyOverrides = useCallback((expr: string, code: string): string => {
    const lits = findNumericLiterals(expr);
    if (!lits.length) return expr;
    const overrides = constOverrides[code] || {};
    let out = '';
    let last = 0;
    lits.forEach((lit, i) => {
      out += expr.slice(last, lit.start);
      const val = overrides[i] ?? parseFloat(lit.text);
      out += String(val);
      last = lit.end;
    });
    out += expr.slice(last);
    return out;
  }, [constOverrides]);

  function renderFormula(expr: string, code: string) {
    const lits = findNumericLiterals(expr);
    const overrides = constOverrides[code] || {};
    const parts: JSX.Element[] = [];
    let last = 0;
    lits.forEach((lit, i) => {
      const pre = expr.slice(last, lit.start);
      if (pre) parts.push(<span key={code + '-pre-' + i}>{pre}</span>);
      const shown = overrides[i] ?? lit.text;
      const editing = editConst && editConst.code === code && editConst.index === i;
      parts.push(
        <span
          key={code + '-num-' + i}
          className="text-blue-700 underline decoration-dotted cursor-pointer"
          onClick={() => setEditConst({ code, index: i, value: String(shown) })}
        >
          {editing ? (
            <ClearableNumberInput
              autoFocus
              allowEmpty
              className="w-20 px-1 py-0.5 border rounded"
              value={editConst.value}
              onChange={(e) => setEditConst({ code, index: i, value: e.currentTarget.value })}
              onBlur={() => {
                const num = Number(editConst?.value);
                setConstOverrides((prev) => ({
                  ...prev,
                  [code]: { ...(prev[code] || {}), [i]: num },
                }));
                setEditConst(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const num = Number(editConst?.value);
                  setConstOverrides((prev) => ({
                    ...prev,
                    [code]: { ...(prev[code] || {}), [i]: num },
                  }));
                  setEditConst(null);
                } else if (e.key === 'Escape') {
                  setEditConst(null);
                }
              }}
            />
          ) : (
            <>{String(shown)}</>
          )}
        </span>
      );
      last = lit.end;
    });
    const tail = expr.slice(last);
    if (tail) parts.push(<span key={code + '-tail'}>{tail}</span>);
    return <span>= {parts}</span>;
  }

  const [missingByCode, setMissingByCode] = useState<Record<string, string[]>>({});

  const { ctx: context, missing } = useMemo(() => {
    const ctx: Record<string, number> = { ...vals };
    const missing: Record<string, string[]> = {};
    // Multi-pass to allow dependencies
    let safety = 0;
    let progressed = true;
    while (progressed && safety++ < 120) {
      progressed = false;
      for (const row of TAKEOFF_LAYOUT) {
        if (row.type !== 'cells') continue;
        for (const cell of row.cells) {
          if (!cell || cell.kind !== 'calc' || !cell.expr) continue;
          try {
            // Track missing refs first
            const modified = applyOverrides(cell.expr, cell.code);
            const req = varsFromExpr(modified).filter(
              (v) => ctx[v] === undefined || Number.isNaN(ctx[v])
            );
            if (req.length) {
              missing[cell.code] = req;
            } else if (missing[cell.code]) {
              delete missing[cell.code];
            }
            const v = parser.evaluate(modified, ctx);
            if (Number.isFinite(v)) {
              if (ctx[cell.code] !== v) {
                ctx[cell.code] = Number(v);
                progressed = true;
              }
            }
          } catch {}
        }
      }
    }
    return { ctx, missing };
  }, [vals, applyOverrides]);

  const sections = useMemo(() => {
    const s = new Set<string>();
    QUOTE_LINE_MAP.forEach(m => {
      if (m.section) s.add(m.section.toUpperCase());
    });
    manualCatalog.forEach((item) => {
      if (item.section) s.add(item.section.toUpperCase());
    });
    // Add common fallback ones if not present
    s.add('PRELIMINARIES');
    s.add('LABOUR');
    s.add('ELECTRICALS');
    return Array.from(s).sort();
  }, [manualCatalog]);

  const catalogBySection = useMemo(() => {
    const map = new Map<string, ManualCatalogItem[]>();
    manualCatalog.forEach((item) => {
      const section = (item.section || 'OTHER').toUpperCase();
      if (!map.has(section)) map.set(section, []);
      map.get(section)!.push({
        ...item,
        rate: rateOverrides[manualRateCode(item.id)] ?? item.rate,
      });
    });
    for (const items of map.values()) {
      items.sort((a, b) => a.description.localeCompare(b.description));
    }
    return map;
  }, [manualCatalog, rateOverrides]);

  const quoteLinesPreview = useMemo(() => {
    const lines: any[] = [];
    const ctx = normalizeContext(context);

    // 1) QUOTE_LINE_MAP items
    for (const m of QUOTE_LINE_MAP) {
      // Skip tiles if toggled off
      if (!includeTiles && m.description === 'Concrete tiles  Double Roman black') continue;

      const qty = evalExpr(ctx, m.code); 
      if (!(qty > 0)) continue;

      const rate = rateOverrides[m.code] ?? m.rate ?? 0;
      lines.push({
        description: m.description,
        quantity: Math.ceil(Number(qty)),
        unitPrice: rate,
        section: m.section,
        itemType: m.itemType || 'MATERIAL',
        lineTotalMinor: BigInt(Math.round(Math.ceil(Number(qty)) * rate * 100)),
        unit: m.unit,
        code: m.code,
        labourNote: m.labourNote || '',
      });
    }

    // 2) Electrical items (optional)
    if (includeElectricals) {
      for (const ei of electricalItems) {
        if (!ei.description || !(Number.isFinite(ei.qty) && ei.qty > 0)) continue;
        const rate = Number(ei.rate || 0);
        lines.push({
          description: ei.description,
          quantity: Math.ceil(Number(ei.qty)),
          unitPrice: rate,
          section: ei.section || 'ELECTRICALS',
          itemType: ei.itemType || 'MATERIAL',
          lineTotalMinor: BigInt(Math.round(Math.ceil(Number(ei.qty)) * rate * 100)),
          unit: ei.unit,
          code: ei.id,
        });
      }
    }

    // 3) custom items
    for (const ci of customItems) {
      if (!ci.description || !(Number.isFinite(ci.qty) && ci.qty > 0)) continue;
      
      // Or if the section is 'LABOUR'
      const isLabour = ci.itemType === 'LABOUR' || ci.description.toLowerCase().includes('labour') ||
                       ci.description.toLowerCase().includes('labor') ||
                       (ci.section || '').toUpperCase().includes('LABOUR');

      lines.push({
        description: ci.description,
        quantity: Math.ceil(Number(ci.qty)),
        unitPrice: Number(ci.rate || 0),
        section: ci.section || 'PRELIMINARIES',
        itemType: isLabour ? 'LABOUR' : 'MATERIAL',
        lineTotalMinor: BigInt(Math.round(Math.ceil(Number(ci.qty)) * Number(ci.rate || 0) * 100)),
        unit: ci.unit,
        code: ci.catalogId ? manualRateCode(ci.catalogId) : 'MANUAL',
      });
    }
    return lines;
  }, [context, customItems, includeTiles, includeElectricals, electricalItems, rateOverrides]);

  const summary = useMemo(() => {
    let totalLabour = 0n;
    let totalMaterials = 0n;
    quoteLinesPreview.forEach(l => {
      if (l.itemType === 'LABOUR') totalLabour += l.lineTotalMinor;
      else totalMaterials += l.lineTotalMinor;
    });
    const baseTotal = totalLabour + totalMaterials;
    const pg = BigInt(Math.round(Number(baseTotal) * pgPct));
    const subtotal1 = baseTotal + pg;
    const contingency = BigInt(Math.round(Number(subtotal1) * contingencyPct));
    const grandTotal = subtotal1 + contingency;

    return { totalLabour, totalMaterials, baseTotal, pg, contingency, grandTotal };
  }, [quoteLinesPreview, pgPct, contingencyPct]);

  const requiredTakeoffInputsFilled = useMemo(() => {
    return TAKEOFF_LAYOUT.every((row) => {
      if (row.type !== 'cells') return true;
      return row.cells.every((cell) => {
        if (!cell || cell.kind !== 'input' || !cell.label.trim()) return true;
        const value = vals[cell.code] ?? TAKEOFF_DEFAULTS[cell.code];
        return Number.isFinite(value) && Number(value) > 0;
      });
    });
  }, [vals]);

  const manualItemsComplete = customItems.every((item) => {
    const touched =
      Boolean(item.catalogId) ||
      item.description.trim() !== '' ||
      item.unit.trim() !== '' ||
      Number.isFinite(item.qty) && item.qty > 0 ||
      Number.isFinite(item.rate) && item.rate > 0;
    if (!touched) return true;
    return (
      item.description.trim() !== '' &&
      item.unit.trim() !== '' &&
      item.section.trim() !== '' &&
      Number.isFinite(item.qty) &&
      item.qty > 0 &&
      Number.isFinite(item.rate) &&
      item.rate >= 0
    );
  });

  const electricalItemsComplete = !includeElectricals || electricalItems.every((item) => (
    item.description.trim() !== '' &&
    item.unit.trim() !== '' &&
    Number.isFinite(item.qty) &&
    item.qty > 0 &&
    Number.isFinite(item.rate) &&
    item.rate >= 0
  ));

  const requiredFieldsFilled =
    customer.name.trim() !== '' &&
    customer.email.trim() !== '' &&
    customer.phone.trim() !== '' &&
    customer.city.trim() !== '' &&
    customerAddress.trim() !== '' &&
    requiredTakeoffInputsFilled &&
    manualItemsComplete &&
    electricalItemsComplete &&
    quoteLinesPreview.length > 0;

  const missingTakeoffInputs = useMemo(() => {
    const issues: Array<{ code: string; label: string }> = [];
    for (const row of TAKEOFF_LAYOUT) {
      if (row.type !== 'cells') continue;
      for (const cell of row.cells) {
        if (!cell || cell.kind !== 'input' || !cell.label.trim()) continue;
        const value = vals[cell.code] ?? TAKEOFF_DEFAULTS[cell.code];
        if (!Number.isFinite(value) || Number(value) <= 0) {
          issues.push({ code: cell.code, label: cell.label });
        }
      }
    }
    return issues;
  }, [vals]);

  const touchedManualItem = useCallback((item: CustomItem) => (
    Boolean(item.catalogId) ||
    item.description.trim() !== '' ||
    item.unit.trim() !== '' ||
    (Number.isFinite(item.qty) && item.qty > 0) ||
    (Number.isFinite(item.rate) && item.rate > 0)
  ), []);

  const incompleteManualRows = useMemo(() => customItems
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => touchedManualItem(item))
    .filter(({ item }) => !(
      item.description.trim() !== '' &&
      item.unit.trim() !== '' &&
      item.section.trim() !== '' &&
      Number.isFinite(item.qty) && item.qty > 0 &&
      Number.isFinite(item.rate) && item.rate >= 0
    )), [customItems, touchedManualItem]);

  const incompleteElectricalRows = useMemo(() => {
    if (!includeElectricals) return [];
    return electricalItems
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !(
        item.description.trim() !== '' &&
        item.unit.trim() !== '' &&
        Number.isFinite(item.qty) && item.qty > 0 &&
        Number.isFinite(item.rate) && item.rate >= 0
      ));
  }, [electricalItems, includeElectricals]);

  const validationIssues = useMemo(() => {
    const issues: string[] = [];
    if (!customer.name.trim()) issues.push('Customer full name is required.');
    if (!customer.email.trim()) issues.push('Customer email address is required.');
    if (!customer.phone.trim()) issues.push('Customer phone number is required.');
    if (!customer.city.trim()) issues.push('Customer city or location is required.');
    if (!customerAddress.trim()) issues.push('Customer physical address is required.');
    missingTakeoffInputs.forEach((item) => issues.push(`${item.label} (${item.code}) must be greater than zero.`));
    incompleteManualRows.forEach(({ index }) => issues.push(`Manual item row ${index + 1} is incomplete.`));
    incompleteElectricalRows.forEach(({ index }) => issues.push(`Electrical item row ${index + 1} is incomplete.`));
    if (quoteLinesPreview.length === 0) issues.push('At least one quote line must be produced before generation.');
    return issues;
  }, [customer, customerAddress, incompleteElectricalRows, incompleteManualRows, missingTakeoffInputs, quoteLinesPreview.length]);

  const missingTakeoffCodeSet = useMemo(
    () => new Set(missingTakeoffInputs.map((item) => item.code)),
    [missingTakeoffInputs],
  );

  useEffect(() => {
    setMissingByCode(missing);
  }, [missing]);

  function buildDraftState() {
    return {
      vals: sanitizeNumberMap(vals),
      units,
      customItems: customItems.map((item) => ({
        ...item,
        qty: Number.isFinite(item.qty) ? item.qty : null,
        rate: Number.isFinite(item.rate) ? item.rate : null,
      })),
      notesText,
      includeTiles,
      includeElectricals,
      electricalItems: electricalItems.map((item) => ({
        ...item,
        qty: Number.isFinite(item.qty) ? item.qty : null,
        rate: Number.isFinite(item.rate) ? item.rate : null,
      })),
      constOverrides,
    };
  }

  async function onSaveDraft() {
    setSavingDraft(true);
    try {
      setFormError(null);
      setDraftMessage(null);
      const res = await saveTakeoffQuoteDraft({
        draftId: draftId || null,
        customer: {
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          city: customer.city,
          address: customerAddress,
        },
        currency,
        vatRate,
        pgRate: pgPct * 100,
        contingencyRate: contingencyPct * 100,
        state: buildDraftState(),
        previewLines: quoteLinesPreview.map((line) => ({
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          unit: line.unit ?? null,
          section: line.section ?? null,
          itemType: line.itemType ?? null,
          code: line.code ?? null,
        })),
      });
      setDraftId(res.quoteId);
      setDraftMessage('Draft saved. You can find it in My Quotes and continue later.');
      router.replace(`/quotes/new?draftId=${res.quoteId}`, { scroll: false });
      router.refresh();
    } catch (err: any) {
      console.error('Draft save failed:', err);
      setFormError(err.message || 'Failed to save draft. Please try again.');
    } finally {
      setSavingDraft(false);
    }
  }

  function rowsForTab() {
    const idxLabour = TAKEOFF_LAYOUT.findIndex(
      (r) => r.type === 'heading' && r.title.toUpperCase().includes('LABOUR')
    );
    if (idxLabour === -1) return TAKEOFF_LAYOUT;
    if (tab === 'materials') return TAKEOFF_LAYOUT.slice(0, idxLabour);
    return TAKEOFF_LAYOUT.slice(idxLabour);
  }

  // async function onCreateQuote() {
  //   setCreating(true);
  //   try {
  //     setFormError(null);
  //     const { customerId } = await upsertCustomer({
  //       displayName: customer.name || 'Walk-in Customer',
  //       email: customer.email || null,
  //       phone: customer.phone || null,
  //     });
  //     // Prefer explicit mapping: codes -> description/unit/rate
  //     const lines: any[] = [];
  //     for (const m of QUOTE_LINE_MAP) {
  //       const qty = context[m.code];
  //       if (!Number.isFinite(qty) || qty <= 0) continue;
  //       lines.push({
  //         description: m.description,
  //         quantity: Number(qty),
  //         unitPrice: m.rate ?? 0,
  //         metaJson: {
  //           unit: m.unit || '',
  //           code: m.code,
  //           label: m.description,
  //           section: m.section || null,
  //           from: 'TakeOffSheet',
  //         },
  //       });
  //     }

  //     // Note: removed fallback auto-inclusion of all worksheet cells.
  //     // Only include explicitly mapped items and manual rows.
  //     // Append manual items
  //     for (const ci of customItems) {
  //       if (!ci.description || !(Number.isFinite(ci.qty) && ci.qty > 0)) continue;
  //       lines.push({
  //         description: ci.description,
  //         quantity: Number(ci.qty),
  //         unitPrice: Number(ci.rate || 0),
  //         metaJson: {
  //           unit: ci.unit || '',
  //           code: 'MANUAL',
  //           label: ci.description,
  //           section: ci.section || 'CUSTOM',
  //           from: 'Manual',
  //         },
  //       });
  //     }
  //     if (lines.length === 0) {
  //       setFormError('No items to include. Enter inputs so at least one value is > 0.');
  //       return; // do not proceed
  //     }
  //     const res = await createQuote({
  //       customerId,
  //       currency,
  //       vatRate,
  //       discountPolicy: 'none',
  //       lines,
  //     });
  //     router.push(`/quotes/${res.quoteId}`);
  //   } finally {
  //     setCreating(false);
  //   }
  // }
  // Preview: count of items with qty > 0

  async function onCreateQuote() {
    setShowValidation(true);
    setCreating(true);
    try {
      setFormError(null);

      if (!requiredFieldsFilled) {
        setFormError('Some fields need attention before the quotation can be generated. Review the highlighted fields below.');
        return;
      }

      const { customerId } = await upsertCustomer({
        displayName: customer.name || 'Walk-in Customer',
        city: customer.city || null,
        email: customer.email || null,
        phone: customer.phone || null,
        addressJson: customerAddress ? JSON.stringify({ line1: customerAddress }) : null,
      });

      const lines = quoteLinesPreview.map(l => ({
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        section: l.section,
        itemType: l.itemType,
        metaJson: {
          unit: l.unit || '',
          code: l.code,
          label: l.description,
          section: l.section || null,
          from: 'TakeOffSheet',
          ...(l.labourNote ? { labourNote: l.labourNote } : {}),
        },
      }));

      if (lines.length === 0) {
        setFormError('No items to include. Enter inputs so at least one value is > 0.');
        return;
      }

      const res = await createQuote({
        draftId: draftId || undefined,
        customerId,
        currency,
        vatRate,
        discountPolicy: 'none',
        lines,
        assumptions: JSON.stringify([notesText]),
        exclusions: JSON.stringify([]),
        pgRate: pgPct * 100,
        contingencyRate: contingencyPct * 100,
      });

      router.push(`/dashboard`);
    } catch (err: any) {
      console.error('Quote creation failed:', err);
      setFormError(err.message || 'Failed to create quote. Please try again.');
    } finally {
      setCreating(false);
    }
  }

  const itemCount = (() => {
    let n = 0;
    for (const row of TAKEOFF_LAYOUT) {
      if (row.type !== 'cells') continue;
      for (const cell of row.cells) {
        if (!cell || !cell.label || cell.label.trim() === '') continue;
        const qty = context[cell.code];
        if (Number.isFinite(qty) && qty > 0) n += 1;
      }
    }
    // Include custom items
    n += customItems.filter((ci) => Number.isFinite(ci.qty) && ci.qty > 0 && ci.description).length;
    return n;
  })();

  return (
    <div className="space-y-8">
      {/* Customer & Settings at top */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:bg-gray-800 dark:border-gray-700 transition-all hover:shadow-md">
        <div className="mb-6 flex items-center gap-3 border-b border-gray-100 pb-4 dark:border-gray-700">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-900/20">
            <UserIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Customer Details</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Enter customer information for this quote</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Full Name</label>
            <div className="relative">
              <input
                className={attentionInputClass(showValidation && !customer.name.trim(), "block w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-3 text-sm text-gray-900 transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:focus:border-blue-400")}
                placeholder="John Doe"
                value={customer.name}
                onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
              />
              <UserIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Email Address</label>
            <div className="relative">
              <input
                className={attentionInputClass(showValidation && !customer.email.trim(), "block w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-3 text-sm text-gray-900 transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:focus:border-blue-400")}
                placeholder="john@example.com"
                value={customer.email}
                onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
              />
              <EnvelopeIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Phone Number</label>
            <div className="relative">
              <input
                className={attentionInputClass(showValidation && !customer.phone.trim(), "block w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-3 text-sm text-gray-900 transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:focus:border-blue-400")}
                placeholder="+1 (555) 000-0000"
                value={customer.phone}
                onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
              />
              <PhoneIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">City / Location</label>
            <div className="relative">
              <input
                className={attentionInputClass(showValidation && !customer.city.trim(), "block w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-3 text-sm text-gray-900 transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:focus:border-blue-400")}
                placeholder="New York, NY"
                value={customer.city}
                onChange={(e) => setCustomer({ ...customer, city: e.target.value })}
              />
              <BuildingOfficeIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            </div>
          </div>

          <div className="col-span-1 space-y-2 md:col-span-2 lg:col-span-4">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Physical Address</label>
            <div className="relative">
              <textarea
                className={attentionInputClass(showValidation && !customerAddress.trim(), "block w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-3 text-sm text-gray-900 transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:focus:border-blue-400")}
                placeholder="Enter full delivery or billing address..."
                rows={2}
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
              />
              <MapPinIcon className="absolute left-3 top-4 h-4 w-4 text-gray-400" />
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {formError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
            {formError}
          </div>
        )}
        {draftMessage && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300">
            {draftMessage}
          </div>
        )}
        {showValidation && validationIssues.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
            <div className="font-semibold">Fields that need attention</div>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {validationIssues.slice(0, 12).map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
              {validationIssues.length > 12 && <li>{validationIssues.length - 12} more item(s) need attention.</li>}
            </ul>
          </div>
        )}
        
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
            <button
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                tab === 'materials' 
                  ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400' 
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
              onClick={() => setTab('materials')}
            >
              <BeakerIcon className="h-4 w-4" />
              Materials
            </button>
            <button
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                tab === 'labour' 
                  ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400' 
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
              onClick={() => setTab('labour')}
            >
              <WrenchScrewdriverIcon className="h-4 w-4" />
              Labour
            </button>
          </div>

          <button
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:ring-4 focus:ring-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            onClick={async () => {
              const res = await fetch('/takeoff/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ inputs: vals, label: `takeoff-${Date.now()}` }),
              });
              if (!res.ok) return alert('Export failed');
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `takeoff-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.xlsx`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
            }}
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
            Generate Excel
          </button>
        </div>

        <div className="space-y-6">
          {rowsForTab().map((row, rIdx) => {
            if (row.type === 'heading') {
              return (
                <div key={rIdx} className="flex items-center gap-2 border-b border-gray-200 pb-2 mt-8 mb-4 dark:border-gray-700">
                  <div className="h-8 w-1 bg-blue-600 rounded-full"></div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white uppercase tracking-tight">
                    {row.title}
                  </h2>
                </div>
              );
            }
            if (row.type === 'subheading') {
              return (
                <h3 key={rIdx} className="text-sm font-bold text-gray-500 uppercase tracking-wider mt-6 mb-3 dark:text-gray-400">
                  {row.title}
                </h3>
              );
            }
            const isMaterials = tab === 'materials';
            const visibleCells =
              row.type === 'cells'
                ? row.cells.filter((c) => c && c.label && c.label.trim() !== '' && c.kind === 'input')
                : [];
            if (row.type === 'cells' && visibleCells.length === 0) return null;
            return (
              <div
                key={rIdx}
                className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(250px,1fr))]"
              >
                {visibleCells.map((cell, cIdx) => {
                  const isInput = cell!.kind === 'input';
                  const defaultVal = TAKEOFF_DEFAULTS[cell!.code] ?? 0;
                  const value = isInput
                    ? (vals[cell!.code] ?? defaultVal)
                    : (context as any)[cell!.code];
                  const inputNeedsAttention = showValidation && isInput && missingTakeoffCodeSet.has(cell!.code);
                  return (
                    <div
                      key={cIdx}
                      className={`group rounded-xl border bg-white p-4 shadow-sm transition-all hover:shadow-md dark:bg-gray-800 ${inputNeedsAttention ? 'border-red-300 ring-2 ring-red-500/10 dark:border-red-500' : 'border-gray-100 dark:border-gray-700'}`}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          {cell!.label}
                        </label>
                        <span className="text-[10px] font-mono text-gray-300 dark:text-gray-600">{cell!.code}</span>
                      </div>
                      
                      <div className="relative">
                        {isInput ? (
                          cell!.code === 'A2' ? (
                            <select
                              aria-label="Select block size"
                              className={attentionInputClass(inputNeedsAttention, "block w-full rounded-lg border border-gray-200 bg-gray-50 py-2 px-3 text-sm text-gray-900 transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:focus:border-blue-400")}
                              value={value ?? TAKEOFF_DEFAULTS.A2}
                              onChange={(e) =>
                                setVals((v) => ({ ...v, [cell!.code]: Number(e.target.value) }))
                              }
                            >
                              {[3000, 5000, 7000].map((option) => (
                                <option key={option} value={option}>
                                  {option.toLocaleString()}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <ClearableNumberInput
                              type="number"
                              step={cell!.code === 'B2' || cell!.code === 'C2' ? 0.01 : 'any'}
                              className={attentionInputClass(inputNeedsAttention, "block w-full rounded-lg border border-gray-200 bg-gray-50 py-2 px-3 text-sm text-gray-900 transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:focus:border-blue-400 placeholder:text-gray-400")}
                              value={Number.isFinite(value) ? (value as number) : ''}
                              placeholder={String(TAKEOFF_DEFAULTS[cell!.code] ?? 0)}
                              onChange={(e) => {
                                const raw = e.currentTarget.value;
                                setVals((v) => ({
                                  ...v,
                                  [cell!.code]: raw === '' ? Number.NaN : Number(raw),
                                }));
                              }}
                            />
                          )
                        ) : (
                          <div className="rounded-lg bg-gray-50 py-2 px-3 text-sm font-semibold text-gray-900 dark:bg-gray-900/50 dark:text-white border border-transparent">
                            {Number.isFinite(value) ? Number((value as number).toFixed(4)) : '—'}
                          </div>
                        )}
                        
                        {inputNeedsAttention && (
                          <div className="mt-1 text-[10px] font-medium text-red-500">
                            Required before generating
                          </div>
                        )}
                        {!isInput && !!missingByCode[cell!.code]?.length && (
                          <div className="mt-1 text-[10px] text-red-500">
                            Missing: {missingByCode[cell!.code].join(', ')}
                          </div>
                        )}
                      </div>
                      
                      {cell!.expr && (
                        <div className="mt-2 text-[10px] text-gray-400 font-mono truncate opacity-0 group-hover:opacity-100 transition-opacity">
                          {renderFormula(cell!.expr!, cell!.code)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Options: Tiles toggle & Electricals */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:bg-gray-800 dark:border-gray-700 transition-all hover:shadow-md">
        <div className="mb-4 border-b border-gray-100 pb-2 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Optional Sections</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">Toggle sections to include or exclude from this quotation</p>
        </div>

        <div className="space-y-4">
          {/* Tiles toggle */}
          <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-gray-100 p-3 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50 transition-colors">
            <input
              type="checkbox"
              checked={includeTiles}
              onChange={(e) => setIncludeTiles(e.target.checked)}
              className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-900 dark:text-white">Include Concrete Tiles (Double Roman Black)</span>
              <p className="text-xs text-gray-500 dark:text-gray-400">Under Roof Coverings</p>
            </div>
          </label>

          {/* Electricals toggle */}
          <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-gray-100 p-3 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50 transition-colors">
            <input
              type="checkbox"
              checked={includeElectricals}
              onChange={(e) => setIncludeElectricals(e.target.checked)}
              className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-900 dark:text-white">Include Electricals</span>
              <p className="text-xs text-gray-500 dark:text-gray-400">D/Box, Meterboard, Conduits, PVC Couplings, Tubing &amp; Chopping</p>
            </div>
          </label>
        </div>
      </div>

      {/* Electricals items (shown when enabled) */}
      {includeElectricals && (
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:bg-gray-800 dark:border-gray-700 transition-all hover:shadow-md">
          <div className="mb-6 flex items-center gap-3 border-b border-gray-100 pb-4 dark:border-gray-700">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-900/20">
              <BoltIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Electricals</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Edit quantities, rates, or remove items as needed</p>
            </div>
          </div>

          <div className="space-y-4">
            {electricalItems.map((ei, idx) => (
              <div key={ei.id} className={`flex flex-col gap-3 rounded-xl border bg-gray-50 p-4 dark:bg-gray-900/50 md:flex-row md:items-start ${showValidation && incompleteElectricalRows.some((row) => row.index === idx) ? 'border-red-300 ring-2 ring-red-500/10 dark:border-red-500' : 'border-gray-100 dark:border-gray-700'}`}>
                <div className="flex-1 space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Description</label>
                  <input
                    className={attentionInputClass(showValidation && includeElectricals && !ei.description.trim(), "block w-full rounded-lg border border-gray-200 bg-white py-1.5 px-3 text-sm text-gray-900 transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white")}
                    value={ei.description}
                    onChange={(e) =>
                      setElectricalItems((arr) =>
                        arr.map((x, i) => (i === idx ? { ...x, description: e.target.value } : x))
                      )
                    }
                  />
                </div>
                <div className="w-full md:w-24 space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Unit</label>
                  <input
                    className={attentionInputClass(showValidation && includeElectricals && !ei.unit.trim(), "block w-full rounded-lg border border-gray-200 bg-white py-1.5 px-3 text-sm text-gray-900 transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white")}
                    value={ei.unit}
                    onChange={(e) =>
                      setElectricalItems((arr) =>
                        arr.map((x, i) => (i === idx ? { ...x, unit: e.target.value } : x))
                      )
                    }
                  />
                </div>
                <div className="w-full md:w-24 space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Qty</label>
                  <ClearableNumberInput
                    className={attentionInputClass(showValidation && includeElectricals && (!Number.isFinite(ei.qty) || ei.qty <= 0), "block w-full rounded-lg border border-gray-200 bg-white py-1.5 px-3 text-sm text-gray-900 transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white")}
                    value={Number.isFinite(ei.qty) ? ei.qty : ''}
                    onChange={(e) => {
                      const raw = e.currentTarget.value;
                      setElectricalItems((arr) =>
                        arr.map((x, i) =>
                          i === idx ? { ...x, qty: raw === '' ? Number.NaN : Number(raw) } : x
                        )
                      );
                    }}
                  />
                </div>
                <div className="w-full md:w-24 space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Rate</label>
                  <ClearableNumberInput
                    className={attentionInputClass(showValidation && includeElectricals && (!Number.isFinite(ei.rate) || ei.rate < 0), "block w-full rounded-lg border border-gray-200 bg-white py-1.5 px-3 text-sm text-gray-900 transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white")}
                    value={Number.isFinite(ei.rate) ? ei.rate : ''}
                    onChange={(e) => {
                      const raw = e.currentTarget.value;
                      setElectricalItems((arr) =>
                        arr.map((x, i) =>
                          i === idx ? { ...x, rate: raw === '' ? Number.NaN : Number(raw) } : x
                        )
                      );
                    }}
                  />
                </div>
                <div className="pt-6">
                  <button
                    type="button"
                    title="Remove electrical item"
                    className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 transition-colors"
                    onClick={() => setElectricalItems((arr) => arr.filter((_, i) => i !== idx))}
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="flex items-center gap-2 text-sm font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400"
              onClick={() =>
                setElectricalItems((arr) => [
                  ...arr,
                  { id: `elec-custom-${Date.now()}`, description: '', unit: 'no', qty: 0, rate: 0, section: 'ELECTRICALS', itemType: 'MATERIAL' },
                ])
              }
            >
              <PlusIcon className="h-4 w-4" />
              Add Electrical Item
            </button>
          </div>
        </div>
      )}

      {/* Manual additional items */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:bg-gray-800 dark:border-gray-700 transition-all hover:shadow-md">
        <div className="mb-6 flex items-center gap-3 border-b border-gray-100 pb-4 dark:border-gray-700">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-50 dark:bg-purple-900/20">
            <PlusIcon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Manual Items</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Add extra items not covered above</p>
          </div>
        </div>

        <div className="space-y-4">
          {customItems.map((ci, idx) => (
            <div key={idx} className={`flex flex-col gap-3 rounded-xl border bg-gray-50 p-4 dark:bg-gray-900/50 md:flex-row md:items-start ${showValidation && incompleteManualRows.some((row) => row.index === idx) ? 'border-red-300 ring-2 ring-red-500/10 dark:border-red-500' : 'border-gray-100 dark:border-gray-700'}`}>
              <div className="w-full md:w-48 space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Pick Saved Item</label>
                <select
                  aria-label="Pick saved manual item"
                  className="block w-full rounded-lg border border-gray-200 bg-white py-1.5 px-3 text-sm text-gray-900 transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  value={ci.catalogId ?? ''}
                  onChange={(e) => {
                    const catalogId = e.target.value;
                    const item = catalogBySection.get((ci.section || '').toUpperCase())?.find((entry) => entry.id === catalogId);
                    setCustomItems((arr) =>
                      arr.map((x, i) =>
                        i === idx && item
                          ? {
                              ...x,
                              catalogId: item.id,
                              description: item.description,
                              unit: item.unit,
                              qty: item.quantity,
                              rate: item.rate,
                              section: item.section,
                              itemType: item.itemType,
                            }
                          : i === idx
                            ? { ...x, catalogId: undefined }
                            : x
                      )
                    );
                  }}
                >
                  <option value="">Type manually</option>
                  {(catalogBySection.get((ci.section || '').toUpperCase()) ?? []).map((item) => (
                    <option key={item.id} value={item.id}>{item.description}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Description</label>
                <input
                  className={attentionInputClass(showValidation && touchedManualItem(ci) && !ci.description.trim(), "block w-full rounded-lg border border-gray-200 bg-white py-1.5 px-3 text-sm text-gray-900 transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white")}
                  placeholder="Item description"
                  value={ci.description}
                  onChange={(e) =>
                    setCustomItems((arr) =>
                      arr.map((x, i) => (i === idx ? { ...x, catalogId: undefined, description: e.target.value } : x))
                    )
                  }
                />
              </div>
              <div className="w-full md:w-24 space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Unit</label>
                <input
                  className={attentionInputClass(showValidation && touchedManualItem(ci) && !ci.unit.trim(), "block w-full rounded-lg border border-gray-200 bg-white py-1.5 px-3 text-sm text-gray-900 transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white")}
                  placeholder="ea"
                  value={ci.unit}
                  onChange={(e) =>
                    setCustomItems((arr) =>
                      arr.map((x, i) => (i === idx ? { ...x, unit: e.target.value } : x))
                    )
                  }
                />
              </div>
              <div className="w-full md:w-24 space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Qty</label>
                <ClearableNumberInput
                  className={attentionInputClass(showValidation && touchedManualItem(ci) && (!Number.isFinite(ci.qty) || ci.qty <= 0), "block w-full rounded-lg border border-gray-200 bg-white py-1.5 px-3 text-sm text-gray-900 transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white")}
                  value={Number.isFinite(ci.qty) ? ci.qty : ''}
                  onChange={(e) => {
                    const raw = e.currentTarget.value;
                    setCustomItems((arr) =>
                      arr.map((x, i) =>
                        i === idx ? { ...x, qty: raw === '' ? Number.NaN : Number(raw) } : x
                      )
                    );
                  }}
                />
              </div>
              <div className="w-full md:w-24 space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Rate</label>
                <ClearableNumberInput
                  className={attentionInputClass(showValidation && touchedManualItem(ci) && (!Number.isFinite(ci.rate) || ci.rate < 0), "block w-full rounded-lg border border-gray-200 bg-white py-1.5 px-3 text-sm text-gray-900 transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white")}
                  value={Number.isFinite(ci.rate) ? ci.rate : ''}
                  onChange={(e) => {
                    const raw = e.currentTarget.value;
                    setCustomItems((arr) =>
                      arr.map((x, i) =>
                        i === idx ? { ...x, rate: raw === '' ? Number.NaN : Number(raw) } : x
                      )
                    );
                  }}
                />
              </div>
              <div className="w-full md:w-32 space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Section</label>
                <div className="space-y-1.5">
                  <select
                    aria-label="Section"
                    className="block w-full rounded-lg border border-gray-200 bg-white py-1.5 px-3 text-sm text-gray-900 transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    value={sections.includes((ci.section || '').toUpperCase()) ? (ci.section || '').toUpperCase() : 'OTHER'}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomItems((arr) =>
                        arr.map((x, i) => (i === idx ? { ...x, catalogId: undefined, section: val } : x))
                      );
                    }}
                  >
                    {sections.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                    <option value="OTHER">OTHER (TYPE BELOW)</option>
                  </select>
                  
                  {(!sections.includes((ci.section || '').toUpperCase()) || (ci.section || '').toUpperCase() === 'OTHER') && (
                    <input
                      className={attentionInputClass(showValidation && touchedManualItem(ci) && !ci.section.trim(), "block w-full rounded-lg border border-gray-200 bg-white py-1.5 px-3 text-xs text-gray-900 transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white placeholder:italic")}
                      placeholder="Type custom section..."
                      value={ci.section === 'OTHER' ? '' : ci.section}
                      autoFocus={ci.section === 'OTHER'}
                      onChange={(e) =>
                        setCustomItems((arr) =>
                          arr.map((x, i) => (i === idx ? { ...x, section: e.target.value.toUpperCase() } : x))
                        )
                      }
                    />
                  )}
                </div>
              </div>
              <div className="pt-6">
                <button
                  type="button"
                  title="Remove manual item"
                  className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 transition-colors"
                  onClick={() => setCustomItems((arr) => arr.filter((_, i) => i !== idx))}
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
            onClick={() =>
              setCustomItems((arr) => [
                ...arr,
                { description: '', unit: '', qty: 0, rate: 0, section: sections[0] || 'FOUNDATIONS', itemType: 'MATERIAL' },
              ])
            }
          >
            <PlusIcon className="h-4 w-4" />
            Add Another Item
          </button>
        </div>
      </div>

      {/* Quotation Notes */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:bg-gray-800 dark:border-gray-700 transition-all hover:shadow-md">
        <div className="mb-4 border-b border-gray-100 pb-2 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Quotation Notes</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">Assumptions, Exclusions, and Points to Note</p>
        </div>
        <textarea
          className="block w-full h-64 rounded-lg border border-gray-200 bg-gray-50 py-2.5 px-3 text-sm text-gray-900 font-mono transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:focus:border-blue-400"
          placeholder="Enter detailed notes..."
          value={notesText}
          onChange={(e) => setNotesText(e.target.value)}
        />
      </div>


      <div className="sticky bottom-6 z-10 mx-auto max-w-2xl rounded-2xl border border-gray-200 bg-white/90 p-4 shadow-lg backdrop-blur-sm dark:bg-gray-800/90 dark:border-gray-700">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
           <div className="text-sm font-medium text-gray-600 dark:text-gray-300">
             {requiredFieldsFilled ? 'Ready to generate?' : `${validationIssues.length} item(s) need attention before generating.`}
           </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-5 py-2.5 text-sm font-bold text-blue-700 shadow-sm transition-all hover:bg-blue-50 focus:ring-4 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-900/60 dark:bg-gray-900 dark:text-blue-300 dark:hover:bg-blue-950/40"
              disabled={savingDraft || creating}
              onClick={onSaveDraft}
              title="Save your current inputs as a draft so you can continue later"
            >
              <BookmarkSquareIcon className="h-5 w-5" />
              {savingDraft ? 'Saving...' : 'Save to Draft'}
            </button>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-6 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:bg-green-700 hover:shadow-lg focus:ring-4 focus:ring-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={creating || savingDraft}
              onClick={onCreateQuote}
              title={requiredFieldsFilled ? 'Generate quotation' : 'Show fields that need attention'}
            >
              {creating ? (
                <>Generating...</>
              ) : (
                <>
                  <CheckCircleIcon className="h-5 w-5" />
                  Generate Quotation
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="h-12" />
    </div>
  );
}
