import '@/app/ui/global.css';
import { Montserrat } from 'next/font/google';
import { Metadata } from 'next';

const montserrat = Montserrat({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    template: '%s | Barmlo Enterprise',
    default: 'Barmlo Enterprise',
  },
  description: 'The official Website for Barmlo Enterprise',
  metadataBase: new URL('https://barmlo.co.zw/index.php/services/agricultural-processing'),
  manifest: '/manifest.webmanifest',
  themeColor: '#1d4ed8',
  icons: {
    icon: '/barmlo_logo111.png',
  },
};
import { Toaster } from 'sonner';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${montserrat.className} antialiased`}>
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}