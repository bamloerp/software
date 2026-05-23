'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateRate, updateSystemSetting } from './actions';

type RateItem = {
  code: string;
  description: string;
  unit: string;
  defaultRate: number;
  currentRate: number;
  itemType: string;
};

type Section = { label: string; items: RateItem[] };

type Settings = {
  vatBps: string;
  pgRate: string;
  contingencyRate: string;
};

export default function RatesClient({
  sections,
  settings: initialSettings,
}: {
  sections: Section[];
  settings: Settings;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [settings, setSettings] = useState(initialSettings);
  const [editingSetting, setEditingSetting] = useState<string | null>(null);
  const [settingValue, setSettingValue] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggleCollapse(label: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  function startEdit(code: string, currentRate: number) {
    setEditingCode(code);
    setEditValue(currentRate.toFixed(2));
    setFeedback(null);
  }

  function cancelEdit() {
    setEditingCode(null);
    setEditValue('');
  }

  function saveRate(code: string) {
    const rate = parseFloat(editValue);
    if (!Number.isFinite(rate) || rate < 0) {
      setFeedback('Invalid rate');
      return;
    }
    startTransition(async () => {
      const res = await updateRate(code, rate);
      if (!res.ok) {
        setFeedback(res.error);
      } else {
        setFeedback('Rate updated');
        setEditingCode(null);
        router.refresh();
        setTimeout(() => setFeedback(null), 2000);
      }
    });
  }

  function startSettingEdit(key: string, value: string) {
    setEditingSetting(key);
    // For VAT, convert stored bps to display percentage
    if (key === 'vatBps') {
      setSettingValue(String(Number(value) / 100));
    } else {
      setSettingValue(value);
    }
    setFeedback(null);
  }

  function saveSetting(key: string) {
    const raw = settingValue.trim();
    if (!raw || isNaN(Number(raw))) {
      setFeedback('Invalid value');
      return;
    }
    // For VAT, convert display percentage to stored bps (e.g. 15.5 → 1550)
    const storeVal = key === 'vatBps' ? String(Math.round(Number(raw) * 100)) : raw;
    startTransition(async () => {
      const res = await updateSystemSetting(key, storeVal);
      if (!res.ok) {
        setFeedback(res.error);
      } else {
        setSettings(prev => ({ ...prev, [key]: storeVal }));
        setEditingSetting(null);
        setFeedback('Setting updated');
        router.refresh();
        setTimeout(() => setFeedback(null), 2000);
      }
    });
  }

  const settingsConfig = [
    { key: 'vatBps', label: 'VAT (%)', description: 'e.g. 15 or 15.5', value: settings.vatBps },
    { key: 'pgRate', label: 'P&Gs Rate (%)', description: 'Preliminaries & Generals percentage', value: settings.pgRate },
    { key: 'contingencyRate', label: 'Contingency Rate (%)', description: 'Contingency percentage', value: settings.contingencyRate },
  ];

  return (
    <div className="space-y-8">
      {/* Feedback */}
      {feedback && (
        <div className={`rounded px-4 py-2 text-sm font-medium ${feedback.includes('updated') ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'}`}>
          {feedback}
        </div>
      )}

      {/* Global Settings */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Global Settings
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {settingsConfig.map(s => (
            <div key={s.key} className="rounded-lg border border-gray-100 bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-700">
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">{s.label}</div>
              <div className="text-[10px] text-gray-400 dark:text-gray-500 mb-2">{s.description}</div>
              {editingSetting === s.key ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={settingValue}
                    onChange={e => setSettingValue(e.target.value)}
                    className="w-24 rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveSetting(s.key);
                      if (e.key === 'Escape') setEditingSetting(null);
                    }}
                  />
                  <button onClick={() => saveSetting(s.key)} disabled={isPending} className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700 disabled:opacity-50">Save</button>
                  <button onClick={() => setEditingSetting(null)} className="rounded px-2 py-1 text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-gray-900 dark:text-white">{s.key === 'vatBps' ? `${(Number(s.value) / 100).toFixed(1)}%` : s.value}</span>
                  <button title="Edit" onClick={() => startSettingEdit(s.key, s.value)} className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-600">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path d="m2.695 14.762-1.262 3.155a.5.5 0 0 0 .65.65l3.155-1.262a4 4 0 0 0 1.343-.886L17.5 5.501a2.121 2.121 0 0 0-3-3L3.58 13.419a4 4 0 0 0-.885 1.343Z" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Rate Sections */}
      {sections.map(section => {
        const isCollapsed = collapsed.has(section.label);
        return (
          <div key={section.label} className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
            {/* Section header */}
            <button
              onClick={() => toggleCollapse(section.label)}
              className="flex w-full items-center justify-between px-6 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase">
                  {section.label}
                </h3>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {section.items.length} item{section.items.length !== 1 ? 's' : ''}
                </span>
              </div>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className={`w-5 h-5 text-gray-400 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
              >
                <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
              </svg>
            </button>

            {/* Items table */}
            {!isCollapsed && (
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                  <tr>
                    <th className="px-6 py-2 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Description</th>
                    <th className="px-4 py-2 text-center text-xs font-medium uppercase text-gray-500 dark:text-gray-400 w-16">Unit</th>
                    <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400 w-28">Default</th>
                    <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400 w-36">Current Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {section.items.map(item => {
                    const isChanged = item.currentRate !== item.defaultRate;
                    const isEditing = editingCode === item.code;
                    return (
                      <tr key={item.code} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-6 py-3 text-sm text-gray-900 dark:text-white">
                          {item.description}
                          <span className="ml-2 text-[10px] text-gray-400">{item.code}</span>
                        </td>
                        <td className="px-4 py-3 text-center text-xs text-gray-500 dark:text-gray-400">{item.unit}</td>
                        <td className="px-4 py-3 text-right text-xs text-gray-400">${item.defaultRate.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right">
                          {isEditing ? (
                            <div className="flex items-center justify-end gap-1">
                              <span className="text-xs text-gray-400">$</span>
                              <input
                                type="text"
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                className="w-20 rounded border border-gray-300 px-2 py-1 text-right text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                                autoFocus
                                onKeyDown={e => {
                                  if (e.key === 'Enter') saveRate(item.code);
                                  if (e.key === 'Escape') cancelEdit();
                                }}
                              />
                              <button onClick={() => saveRate(item.code)} disabled={isPending} className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700 disabled:opacity-50">
                                &#10003;
                              </button>
                              <button onClick={cancelEdit} className="rounded px-1 py-1 text-xs text-gray-400 hover:text-gray-600">
                                &#10005;
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              <span className={`text-sm font-medium ${isChanged ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-white'}`}>
                                ${item.currentRate.toFixed(2)}
                              </span>
                              {isChanged && (
                                <span className="inline-flex items-center rounded bg-amber-100 px-1 py-0.5 text-[9px] font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                                  MODIFIED
                                </span>
                              )}
                              <button title="Edit rate" onClick={() => startEdit(item.code, item.currentRate)} className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-600">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                  <path d="m2.695 14.762-1.262 3.155a.5.5 0 0 0 .65.65l3.155-1.262a4 4 0 0 0 1.343-.886L17.5 5.501a2.121 2.121 0 0 0-3-3L3.58 13.419a4 4 0 0 0-.885 1.343Z" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}
