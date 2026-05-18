import '../globals.css';
import type { ReactNode } from 'react';
import SidebarShell from '@/components/SidebarShell';
import GlobalSpinner from '@/components/GlobalSpinner';
import { LoadingProvider } from '@/components/LoadingProvider';
import Script from 'next/script';
import FlashToast from '@/components/FlashToast';
import { readFlashMessage } from '@/lib/flash.server';

import { getCurrentUser } from '@/lib/auth';
import ToastProvider from '@/components/ToastProvider';
import IdleLogout from '@/components/IdleLogout';
import PwaInstallPrompt from '@/components/PwaInstallPrompt';

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const [currentUser, flash] = await Promise.all([getCurrentUser(), readFlashMessage()]);

   //const flashs = readFlashMessage();
  return (
    <>
      <Script id="protected-theme" strategy="beforeInteractive">
        {`(() => { try { var t = localStorage.getItem('theme'); var s = window.matchMedia('(prefers-color-scheme: dark)').matches; var dark = t === 'dark' || (t !== 'light' && s); if (dark) document.documentElement.classList.add('dark'); } catch (e) {} })();`}
      </Script>
      <LoadingProvider>
        <GlobalSpinner />
        <div className="min-h-dvh bg-gray-100 text-gray-900 antialiased dark:bg-gray-900 dark:text-gray-100">
          <SidebarShell currentUser={currentUser}>
            <ToastProvider />
            <FlashToast flash={flash} />
            {children}
          </SidebarShell>
          <IdleLogout />
          <PwaInstallPrompt />
        </div>
      </LoadingProvider>
    </>
  );
}
