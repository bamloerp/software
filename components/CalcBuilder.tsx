'use client';
import { useEffect, useMemo, useState } from 'react';
import { Parser } from 'expr-eval';
import { CALC_FIELDS } from '@/lib/calcConfig';
import { createQuote, upsertCustomer } from '@/app/(protected)/actions';
import { UserIcon, EnvelopeIcon, PhoneIcon, BuildingOfficeIcon, MapPinIcon, WrenchScrewdriverIcon, BeakerIcon, CheckCircleIcon, ArrowTopRightOnSquareIcon, CalculatorIcon } from '@heroicons/react/24/outline';

type RowUI = {
  code: string;
  label: string;
  section: 'MATERIALS' | 'LABOUR';
  group?: string;
  kind: 'input' | 'calc';
};

const parser = new Parser({ allowMemberAccess: false });

export default function CalcBuilder() {
  const rows: RowUI[] = CALC_FIELDS;
  const [values, setValues] = useState<Record<string, number>>({});
  const [include, setInclude] = useState<Record<string, boolean>>({});
  const [unit, setUnit] = useState<Record<string, number>>({});
  const [tab, setTab] = useState<'materials' | 'labour'>('materials');

  const [customer, setCustomer] = useState({ name: '', email: '', phone: '', city: '' });
  const [customerAddress, setCustomerAddress] = useState('');
  const [currency, setCurrency] = useState(process.env.NEXT_PUBLIC_CURRENCY || 'USD');
  const [vatRate, setVatRate] = useState<number>(parseFloat(process.env.VAT_DEFAULT || '0.155'));
  const [creating, setCreating] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  // Initialize input defaults
  useEffect(() => {
    const init: Record<string, number> = {};
    for (const r of rows) if (r.kind === 'input') init[r.code] = init[r.code] ?? 0;
    setValues((v) => ({ ...init, ...v }));
  }, [rows]);

  // Compute derived values whenever inputs change
  const computedValues = useMemo(() => {
    const context: Record<string, number> = { ...values };
    const remaining = CALC_FIELDS.filter((f) => f.kind === 'calc').map((f) => f.code);
    let guard = 0;
    while (remaining.length && guard++ < 100) {
      let progressed = false;
      for (let i = 0; i < remaining.length; i++) {
        const code = remaining[i];
        const f = CALC_FIELDS.find((x) => x.code === code)!;
        if (!f.expr) continue;
        try {
          const val = parser.evaluate(f.expr, context);
          if (Number.isFinite(val)) {
            context[code] = Number(val);
            remaining.splice(i, 1);
            i--;
            progressed = true;
          }
        } catch {}
      }
      if (!progressed) break;
    }
    return context;
  }, [values]);

  async function onCreateQuote() {
    setCreating(true);
    try {
      const { customerId } = await upsertCustomer({
        displayName: customer.name || 'Walk-in Customer',
        city: customer.city || null,
        email: customer.email || null,
        phone: customer.phone || null,
        address: customerAddress || null,
      });
      // Build lines from included rows
      const lines = Object.keys(include)
        .filter((code) => include[code])
        .map((code) => ({
          description: `${code} - ${rows.find((r) => r.code === code)?.label || ''}`.trim(),
          quantity: 1,
          unitPrice: unit[code] ?? 0,
        }));
      const res = await createQuote({
        customerId,
        currency,
        vatRate,
        discountPolicy: 'none',
        lines,
      });
      setCreatedId(res.quoteId);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header Settings */}
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
                className="block w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-3 text-sm text-gray-900 transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:focus:border-blue-400"
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
                className="block w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-3 text-sm text-gray-900 transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:focus:border-blue-400"
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
                className="block w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-3 text-sm text-gray-900 transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:focus:border-blue-400"
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
                className="block w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-3 text-sm text-gray-900 transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:focus:border-blue-400"
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
              <input
                className="block w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-3 text-sm text-gray-900 transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:focus:border-blue-400"
                placeholder="Enter full delivery or billing address..."
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
              />
              <MapPinIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
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
      </div>

      {/* Grid of Items */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {rows
          .filter((r) => r.section === (tab === 'materials' ? 'MATERIALS' : 'LABOUR'))
          .map((r) => (
            <div 
              key={r.code} 
              className={`relative overflow-hidden rounded-xl border p-4 transition-all hover:shadow-md ${
                include[r.code] 
                  ? 'border-blue-200 bg-blue-50/30 dark:border-blue-800 dark:bg-blue-900/10' 
                  : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
              }`}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                      {r.code}
                    </span>
                    {r.group && (
                      <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500">
                        {r.group}
                      </span>
                    )}
                  </div>
                  <h4 className="mt-1 font-medium text-gray-900 dark:text-white">{r.label}</h4>
                </div>
                <div className="flex items-center gap-2">
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={!!include[r.code]}
                      onChange={(e) => setInclude((s) => ({ ...s, [r.code]: e.target.checked }))}
                    />
                    <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:border-gray-600 dark:bg-gray-700 dark:peer-focus:ring-blue-800"></div>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase text-gray-500 dark:text-gray-400">
                    Value / Result
                  </label>
                  {r.kind === 'input' ? (
                    <input
                      type="number"
                      className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:focus:border-blue-400"
                      value={values[r.code] ?? 0}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [r.code]: Number(e.target.value) }))
                      }
                    />
                  ) : (
                    <div className="flex h-[34px] w-full items-center rounded-lg bg-gray-50 px-3 text-sm font-bold text-gray-900 dark:bg-gray-900/50 dark:text-white">
                      {Number.isFinite(computedValues[r.code]) 
                        ? computedValues[r.code].toLocaleString(undefined, { maximumFractionDigits: 2 }) 
                        : '-'}
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase text-gray-500 dark:text-gray-400">
                    Unit Price
                  </label>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                    <input
                      type="number"
                      className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 pl-5 text-sm font-medium text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:focus:border-blue-400"
                      value={unit[r.code] ?? 0}
                      onChange={(e) =>
                        setUnit((u) => ({ ...u, [r.code]: Number(e.target.value) }))
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
      </div>

      {/* Sticky Action Bar */}
      <div className="sticky bottom-6 z-10 mx-auto max-w-2xl rounded-2xl border border-gray-200 bg-white/90 p-4 shadow-lg backdrop-blur-sm dark:bg-gray-800/90 dark:border-gray-700">
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm font-medium text-gray-600 dark:text-gray-300">
            {createdId ? (
              <span className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <CheckCircleIcon className="h-5 w-5" />
                Quote created successfully!
              </span>
            ) : (
              <span>Ready to generate?</span>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            {createdId && (
              <a 
                href={`/quotes/${createdId}`}
                className="inline-flex items-center gap-2 rounded-xl bg-gray-100 px-4 py-2 text-sm font-medium text-gray-900 transition-all hover:bg-gray-200 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600"
              >
                Open Quote
                <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              </a>
            )}
            
            <button
              className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-6 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:bg-green-700 hover:shadow-lg focus:ring-4 focus:ring-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={onCreateQuote}
              disabled={creating}
            >
              {creating ? (
                <>Creating...</>
              ) : (
                <>
                  <CheckCircleIcon className="h-5 w-5" />
                  {createdId ? 'Create Another' : 'Create Quote'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
