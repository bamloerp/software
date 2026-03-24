'use client';
import { useState, useTransition } from 'react';
import LineItemRow, { LineItem } from './LineItemRow';
import { createQuote, upsertCustomer } from '@/app/(protected)/actions';

export default function QuoteBuilder() {
  const [lines, setLines] = useState<LineItem[]>([
    { description: '', quantity: 1, unitPrice: 0, discount: { type: 'percent', value: 0 } },
  ]);
  const [pending, start] = useTransition();
  const [createdId, setCreatedId] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerCity, setCustomerCity] = useState('');

  const [currency, setCurrency] = useState(process.env.NEXT_PUBLIC_CURRENCY || 'USD');
  const [vatRate, setVatRate] = useState<number>(parseFloat(process.env.VAT_DEFAULT || '0.155'));
  const [discountPolicy, setDiscountPolicy] = useState<string>('none');

  function updateLine(idx: number, v: LineItem) {
    setLines((prev) => prev.map((p, i) => (i === idx ? v : p)));
  }
  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  async function onSave() {
    start(async () => {
      const cust = await upsertCustomer({
        displayName: customerName || 'Walk-in Customer',
        city: customerCity || null,
        email: customerEmail || null,
        phone: customerPhone || null,
        address: customerAddress || null,
      });
      const res = await createQuote({
        customerId: cust.customerId,
        currency,
        vatRate,
        discountPolicy,
        lines: lines.map((l) => ({
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discount: l.discount,
        })),
      });
      setCreatedId(res.quoteId);
    });
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Build Quote</h2>
      <div className="grid grid-cols-3 gap-3 bg-white p-4 border rounded">
        <div className="col-span-3 font-medium">Customer</div>
        <input
          className="px-2 py-1 border rounded"
          placeholder="Name"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
        />
        <input
          className="px-2 py-1 border rounded"
          placeholder="Email"
          value={customerEmail}
          onChange={(e) => setCustomerEmail(e.target.value)}
        />
        <input
          className="px-2 py-1 border rounded"
          placeholder="Phone"
          value={customerPhone}
          onChange={(e) => setCustomerPhone(e.target.value)}
        />

        <input
          className="px-2 py-1 border rounded"
          placeholder="Location / Address"
          value={customerAddress}
          onChange={(e) => setCustomerAddress(e.target.value)}
        />
        <input
          className="px-2 py-1 border rounded"
          placeholder="City"
          value={customerCity}
          onChange={(e) => setCustomerCity(e.target.value)}
        />

        {/* <div className="col-span-3 font-medium pt-2">Quote Settings</div>
        <input
          className="px-2 py-1 border rounded"
          placeholder="Currency"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
        />
        <input
          type="number"
          step="0.0001"
          className="px-2 py-1 border rounded"
          placeholder="VAT Rate (e.g., 0.155)"
          value={vatRate}
          onChange={(e) => setVatRate(Number(e.target.value))}
        />
        <select
          aria-label="Discount policy"
          className="px-2 py-1 border rounded"
          value={discountPolicy}
          onChange={(e) => setDiscountPolicy(e.target.value)}
        >
          <option value="none">No Discount Policy</option>
          <option value="bulk">Bulk (5%)</option>
        </select> */}
      </div>
      <div className="flex items-center justify-between">
        <div className="font-medium">Line Items</div>
        <button
          onClick={() =>
            setLines((p) => [
              ...p,
              {
                description: '',
                quantity: 1,
                unitPrice: 0,
                discount: { type: 'percent', value: 0 },
              },
            ])
          }
          className="px-3 py-1 rounded bg-gray-800 text-white"
        >
          Add Line
        </button>
      </div>
      <div>
        {lines.map((l, i) => (
          <LineItemRow
            key={i}
            index={i}
            value={l}
            onChange={(v) => updateLine(i, v)}
            onRemove={() => removeLine(i)}
          />
        ))}
      </div>
      <div className="flex gap-2">
        <button
          disabled={pending}
          onClick={onSave}
          className="px-4 py-2 bg-blue-600 text-white rounded"
        >
          {pending ? 'Saving…' : 'Save Draft'}
        </button>
        {createdId && (
          <a className="px-4 py-2 bg-gray-200 rounded" href={`/quotes/${createdId}`}>
            Open Draft
          </a>
        )}
      </div>
    </div>
  );
}
