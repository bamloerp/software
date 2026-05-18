'use client';

import { useEffect, useRef, useState } from 'react';
import { signOut } from 'next-auth/react';

const IDLE_MS = 5 * 60 * 1000; // 5 minutes
const WARN_MS = 30 * 1000; // show warning during last 30s

export default function IdleLogout() {
  const [warning, setWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(WARN_MS / 1000);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearAll() {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (warnTimer.current) clearTimeout(warnTimer.current);
    if (countdownTimer.current) clearInterval(countdownTimer.current);
  }

  function doLogout() {
    clearAll();
    signOut({ callbackUrl: '/login?reason=inactive' });
  }

  function reset() {
    clearAll();
    setWarning(false);
    warnTimer.current = setTimeout(() => {
      setWarning(true);
      setSecondsLeft(WARN_MS / 1000);
      countdownTimer.current = setInterval(() => {
        setSecondsLeft((s) => (s > 1 ? s - 1 : 0));
      }, 1000);
    }, IDLE_MS - WARN_MS);
    idleTimer.current = setTimeout(doLogout, IDLE_MS);
  }

  useEffect(() => {
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    let last = 0;
    const onActivity = () => {
      const now = Date.now();
      // Throttle to once every 2s to avoid timer churn
      if (now - last < 2000) return;
      last = now;
      reset();
    };
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    reset();
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      clearAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!warning) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Are you still there?</h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          You will be signed out due to inactivity in <strong>{secondsLeft}s</strong>.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={doLogout}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            Sign out now
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded-md bg-barmlo-blue px-3 py-1.5 text-sm font-semibold text-white hover:bg-barmlo-blue/90"
          >
            Stay signed in
          </button>
        </div>
      </div>
    </div>
  );
}
