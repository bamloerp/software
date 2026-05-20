'use client';

import {
  UserIcon,
  KeyIcon,
  ExclamationCircleIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/outline';
import { Button } from '@/app/ui/button';
import { useActionState, useState } from 'react';
import { authenticate } from '@/app/lib/actions';
import { useSearchParams } from 'next/navigation';

export default function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';
  const [errorMessage, formAction, isPending] = useActionState(authenticate, undefined);
  const [isVisible, setIsVisible] = useState(false);

  const toggleVisibility = () => setIsVisible(!isVisible);

  return (
    <form action={formAction} className="w-full">
      <div className="flex-1">
        <div className="w-full space-y-4">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700" htmlFor="email">
              Email
            </label>
            <div className="relative">
              <input
                className="peer block w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 pl-11 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-100"
                id="email"
                type="email"
                name="email"
                placeholder="name@barmlo.co.zw"
                required
              />
              <UserIcon className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400 peer-focus:text-blue-700" />
            </div>
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <input
                className="peer block w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 pl-11 pr-11 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-100"
                id="password"
                type={isVisible ? 'text' : 'password'}
                name="password"
                placeholder="Password"
                required
                minLength={6}
              />
              <KeyIcon className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400 peer-focus:text-blue-700" />
              <button
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700 focus:outline-none"
                type="button"
                onClick={toggleVisibility}
                aria-label="Toggle password visibility"
              >
                {isVisible ? (
                  <EyeSlashIcon className="h-[18px] w-[18px]" />
                ) : (
                  <EyeIcon className="h-[18px] w-[18px]" />
                )}
              </button>
            </div>
          </div>
        </div>
        <input type="hidden" name="redirectTo" value={callbackUrl} />
        <Button
          className="mt-6 w-full justify-center rounded-xl bg-blue-700 py-3 font-bold text-white shadow-lg shadow-blue-700/20 transition-colors hover:bg-blue-800"
          aria-disabled={isPending}
        >
          {isPending ? 'Signing in...' : 'Sign in'}
        </Button>

        <div className="mt-4 text-center">
          <a href="#" className="text-sm font-medium text-blue-700 hover:text-blue-900">
            Forgot Username or Password?
          </a>
        </div>

        <div
          className="mt-4 flex h-8 items-end justify-center space-x-1"
          aria-live="polite"
          aria-atomic="true"
        >
          {errorMessage && (
            <>
              <ExclamationCircleIcon className="h-5 w-5 text-red-500" />
              <p className="rounded bg-red-50 px-2 text-sm font-bold text-red-600">{errorMessage}</p>
            </>
          )}
        </div>
      </div>
    </form>
  );
}
