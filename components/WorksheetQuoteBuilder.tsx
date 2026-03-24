'use client';
import { useMemo, useState, useTransition } from 'react';
import { WORKSHEET_SECTIONS } from '@/lib/worksheetConfig';
import { createQuote, upsertCustomer } from '@/app/(protected)/actions';
import { UserIcon, EnvelopeIcon, PhoneIcon, BuildingOfficeIcon, MapPinIcon, CheckCircleIcon, ArrowTopRightOnSquareIcon, CalculatorIcon, ArchiveBoxIcon } from '@heroicons/react/24/outline';

type RowState = { qty: number; rate: number };

export default function WorksheetQuoteBuilder() {
  const [activeTab, setActiveTab] = useState(WORKSHEET_SECTIONS[0].key);
  const [rows, setRows] = useState<Record<string, RowState>>(() => {
    const init: Record<string, RowState> = {};
    for (const sec of WORKSHEET_SECTIONS) {
      for (const it of sec.items) init[it.id] = { qty: 0, rate: it.defaultRate };
    }
    return init;
  });
  const [customer, setCustomer] = useState({ name: '', email: '', phone: '', city: '' });
  const [currency, setCurrency] = useState(process.env.NEXT_PUBLIC_CURRENCY || 'USD');
  const [vatRate, setVatRate] = useState<number>(parseFloat(process.env.VAT_DEFAULT || '0.155'));
  const [pending, start] = useTransition();
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [customerAddress, setCustomerAddress] = useState('');

  const sectionTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const sec of WORKSHEET_SECTIONS) {
      let t = 0;
      for (const it of sec.items) {
        const s = rows[it.id];
        if (!s) continue;
        t += (s.qty || 0) * (s.rate || 0);
      }
      totals[sec.key] = t;
    }
    return totals;
  }, [rows]);

  const grand = useMemo(
    () => Object.values(sectionTotals).reduce((a, b) => a + b, 0),
    [sectionTotals]
  );

  function setQty(id: string, qty: number) {
    setRows((r) => ({ ...r, [id]: { ...(r[id] || { qty: 0, rate: 0 }), qty } }));
  }
  function setRate(id: string, rate: number) {
    setRows((r) => ({ ...r, [id]: { ...(r[id] || { qty: 0, rate: 0 }), rate } }));
  }

  async function onCreate() {
    setError(null);
    start(async () => {
      try {
        const { customerId } = await upsertCustomer({
          displayName: customer.name || 'Walk-in Customer',
          city: customer.city || null,
          email: customer.email || null,
          phone: customer.phone || null,
          addressJson: customerAddress ? JSON.stringify({ line1: customerAddress }) : null,
        });
        const lines: any[] = [];
        for (const sec of WORKSHEET_SECTIONS) {
          for (const it of sec.items) {
            const s = rows[it.id];
            if (!s || !s.qty) continue;
            lines.push({
              description: it.description,
              quantity: s.qty,
              unitPrice: s.rate,
              metaJson: { section: sec.title, unit: it.unit, itemId: it.id },
            });
          }
        }
        
        if (lines.length === 0) {
          throw new Error('Please add at least one item to the quote.');
        }

        const res = await createQuote({
          customerId,
          currency,
          vatRate,
          discountPolicy: 'none',
          lines,
        });
        setQuoteId(res.quoteId);
      } catch (e: any) {
        console.error(e);
        setError(e.message || 'Failed to create quote');
      }
    });
  }

  return (
    <div className="space-y-6">
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
              <textarea
                className="block w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-3 text-sm text-gray-900 transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:focus:border-blue-400"
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

      {/* Tab Navigation */}
      <div className="flex overflow-x-auto pb-2 scrollbar-hide">
        <div className="flex gap-2 rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
          {WORKSHEET_SECTIONS.map((sec) => (
            <button
              key={sec.key}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                activeTab === sec.key 
                  ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400' 
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
              onClick={() => setActiveTab(sec.key)}
            >
              <ArchiveBoxIcon className="h-4 w-4" />
              {sec.title.split('—')[0].trim()} {/* Shorten title for tab */}
            </button>
          ))}
        </div>
      </div>

      {/* Active Section Content */}
      {WORKSHEET_SECTIONS.filter(s => s.key === activeTab).map((sec) => (
        <div key={sec.key} className="space-y-4">
          <div className="rounded-xl bg-blue-50 p-4 border border-blue-100 dark:bg-blue-900/20 dark:border-blue-800">
            <h3 className="font-bold text-blue-900 dark:text-blue-100">{sec.title}</h3>
            {sec.note && <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">{sec.note}</p>}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {sec.items.map((it) => {
              const st = rows[it.id] || { qty: 0, rate: it.defaultRate };
              const amt = (st.qty || 0) * (st.rate || 0);
              const isActive = st.qty > 0;
              
              return (
                <div 
                  key={it.id} 
                  className={`relative overflow-hidden rounded-xl border p-4 transition-all hover:shadow-md ${
                    isActive
                      ? 'border-blue-200 bg-blue-50/30 dark:border-blue-800 dark:bg-blue-900/10' 
                      : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
                  }`}
                >
                  <div className="mb-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                        {it.unit}
                      </span>
                      {isActive && (
                        <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                          {amt.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
                        </span>
                      )}
                    </div>
                    <h4 className="mt-2 font-medium text-gray-900 dark:text-white line-clamp-2 min-h-[40px]">{it.description}</h4>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold uppercase text-gray-500 dark:text-gray-400">
                        Quantity
                      </label>
                      <input
                        type="number"
                        className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:focus:border-blue-400"
                        value={st.qty || ''}
                        placeholder="0"
                        onChange={(e) => setQty(it.id, Number(e.target.value))}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold uppercase text-gray-500 dark:text-gray-400">
                        Rate
                      </label>
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                        <input
                          type="number"
                          className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 pl-5 text-sm font-medium text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:focus:border-blue-400"
                          value={st.rate}
                          onChange={(e) => setRate(it.id, Number(e.target.value))}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          
          <div className="flex justify-end rounded-xl bg-gray-50 p-4 dark:bg-gray-800/50">
            <div className="text-sm font-medium text-gray-600 dark:text-gray-300">
              Section Total: <span className="ml-2 text-lg font-bold text-gray-900 dark:text-white">{sectionTotals[sec.key].toLocaleString(undefined, { style: 'currency', currency: 'USD' })}</span>
            </div>
          </div>
        </div>
      ))}

      {/* Sticky Action Bar */}
      <div className="sticky bottom-6 z-10 mx-auto max-w-2xl rounded-2xl border border-gray-200 bg-white/90 p-4 shadow-lg backdrop-blur-sm dark:bg-gray-800/90 dark:border-gray-700">
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm font-medium text-gray-600 dark:text-gray-300">
             <div className="flex flex-col">
               <span className="text-xs uppercase tracking-wider text-gray-500">Grand Total (Ex. VAT)</span>
               <span className="text-xl font-bold text-blue-600 dark:text-blue-400">
                 {grand.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
               </span>
             </div>
             {error && (
               <div className="mt-2 text-xs font-bold text-red-600 dark:text-red-400">
                 {error}
               </div>
             )}
          </div>
          
          <div className="flex items-center gap-3">
            {quoteId && (
              <a 
                href={`/quotes/${quoteId}`}
                className="inline-flex items-center gap-2 rounded-xl bg-gray-100 px-4 py-2 text-sm font-medium text-gray-900 transition-all hover:bg-gray-200 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600"
              >
                Open Quote
                <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              </a>
            )}
            
            <button
              className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-6 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:bg-green-700 hover:shadow-lg focus:ring-4 focus:ring-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={onCreate}
              disabled={pending}
            >
              {pending ? (
                <>Creating...</>
              ) : (
                <>
                  <CheckCircleIcon className="h-5 w-5" />
                  {quoteId ? 'Create Another' : 'Create Quote'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
