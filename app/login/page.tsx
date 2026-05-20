import LoginForm from '@/app/ui/login-form';
import { Suspense } from 'react';
import Image from 'next/image';

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-8">
      <div className="absolute inset-0 z-0">
        <Image
          src="/login_bg.png"
          alt="Background"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-slate-950/80" />
        <div className="absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-blue-900/45 to-transparent" />
      </div>

      <div className="relative z-10 grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/15 bg-white shadow-2xl lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden min-h-[620px] overflow-hidden bg-slate-900 p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-950 via-slate-900 to-slate-950" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-orange-500/15 to-transparent" />

          <div className="relative">
            <div className="relative h-52 w-full max-w-md">
              <Image
                src="/Barmlo%20Logo%202026.png"
                alt="Barmlo Logo"
                fill
                className="object-contain object-left"
                priority
              />
            </div>
          </div>

          <div className="relative max-w-md space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-orange-300">
              Enterprise ERP
            </p>
            <h1 className="text-4xl font-bold leading-tight">Built for project control, procurement, and delivery.</h1>
            <p className="text-sm leading-6 text-slate-300">
              Secure access to quotations, projects, dispatches, reports, and daily operations.
            </p>
          </div>
        </section>

        <section className="flex min-h-[620px] flex-col justify-center bg-white px-6 py-10 sm:px-10 lg:px-14">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-8 lg:hidden">
              <div className="relative h-36 w-full">
                <Image
                  src="/Barmlo%20Logo%202026.png"
                  alt="Barmlo Logo"
                  fill
                  className="object-contain object-left"
                  priority
                />
              </div>
            </div>

            <div className="mb-8">
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-orange-600">Welcome back</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">Sign in to Barmlo ERP</h2>
              <p className="mt-2 text-sm text-slate-500">Use your assigned account to continue.</p>
            </div>

            <Suspense>
              <LoginForm />
            </Suspense>
          </div>
        </section>
      </div>
    </main>
  );
}
