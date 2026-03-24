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
    <form action={formAction} className="space-y-3 w-full max-w-sm mx-auto">
      <div className="flex-1 px-6 pb-4 pt-4">
        <h1 className="mb-6 text-2xl text-center text-white font-bold drop-shadow-md">
          Welcome Back!
        </h1>
        <div className="w-full space-y-4">
          <div>
            <label className="sr-only" htmlFor="email">
              Email
            </label>
            <div className="relative">
              <input
                className="peer block w-full rounded-full border-0 py-3 pl-10 text-sm outline-none placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500 shadow-lg"
                id="email"
                type="email"
                name="email"
                placeholder="Username or Email"
                required
              />
              <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900" />
            </div>
          </div>
          <div>
            <label className="sr-only" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <input
                className="peer block w-full rounded-full border-0 py-3 pl-10 pr-10 text-sm outline-none placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500 shadow-lg"
                id="password"
                type={isVisible ? 'text' : 'password'}
                name="password"
                placeholder="Password"
                required
                minLength={6}
              />
              <KeyIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900" />
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
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
          className="mt-6 w-full rounded-full bg-gray-800 hover:bg-gray-700 text-white font-bold py-3 shadow-lg transition-colors uppercase tracking-wider justify-center" 
          aria-disabled={isPending}
        >
          Login
        </Button>
        
        <div className="mt-4 text-center">
          <a href="#" className="text-sm text-white hover:text-gray-200 drop-shadow-md">
            Forgot Username or Password?
          </a>
        </div>
        
        <div className="mt-8 text-center">
          {/* <a href="#" className="text-sm text-white font-semibold hover:text-gray-200 drop-shadow-md">
            Create new account
          </a> */}
        </div>

        <div
          className="flex h-8 items-end space-x-1 justify-center mt-2"
          aria-live="polite"
          aria-atomic="true"
        >
          {errorMessage && (
            <>
              <ExclamationCircleIcon className="h-5 w-5 text-red-500" />
              <p className="text-sm text-red-500 font-bold bg-white/80 px-2 rounded">{errorMessage}</p>
            </>
          )}
        </div>
      </div>
    </form>
  );
}
