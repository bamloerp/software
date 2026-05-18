'use client';

import { useEffect, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const STORAGE_KEY = 'pwa-install-dismissed';

export default function PwaInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // If already installed (standalone display), do nothing
    try {
      if (window.matchMedia('(display-mode: standalone)').matches) return;
      // iOS Safari standalone flag
      if ((navigator as any).standalone === true) return;
    } catch { /* noop */ }

    // Skip if user previously chose "don't ask again"
    try {
      if (localStorage.getItem(STORAGE_KEY) === '1') return;
    } catch { /* noop */ }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler as any);

    const installed = () => {
      setVisible(false);
      setDeferred(null);
    };
    window.addEventListener('appinstalled', installed);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler as any);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  async function onInstall() {
    if (!deferred) return;
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === 'accepted') {
        // Browser will add the app (and a desktop shortcut on most platforms).
        setVisible(false);
        setDeferred(null);
      }
    } catch {
      /* noop */
    }
  }

  function onNotNow() {
    setVisible(false);
  }

  function onDontAskAgain() {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* noop */ }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9998] w-[min(380px,calc(100vw-2rem))] rounded-lg border border-gray-200 bg-white p-4 shadow-lg dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/30">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12" />
            <path d="m7 10 5 5 5-5" />
            <rect x="3" y="17" width="18" height="4" rx="1" />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Install Barmlo ERP</p>
          <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
            Install the app to your desktop for quick access — no browser tab required.
          </p>
        </div>
        <button type="button" onClick={onNotNow} aria-label="Close" className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onDontAskAgain}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          Don't ask again
        </button>
        <button
          type="button"
          onClick={onNotNow}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          Not now
        </button>
        <button
          type="button"
          onClick={onInstall}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
        >
          Install
        </button>
      </div>
    </div>
  );
}
