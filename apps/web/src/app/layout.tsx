import { brand } from '@repo/config/brand';
import { BrandStyle } from '@repo/ui/brand-style';
import { Toaster } from '@repo/ui/toast';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import { getAppUrl } from '@/lib/app-url';
import './globals.css';

// Optional rather than swap: the fallback is measured against Arial, which Android and Linux do not
// have, so Inter swapping in after the first paint re-wrapped the text and moved the whole page, a
// layout shift of 0.34 on a profile (NFR-PERF-04, D-132). Inter is preloaded, so it is almost always
// there in time; when it is not, that one page stays in the fallback rather than jumping.
const inter = Inter({ subsets: ['latin'], display: 'optional', variable: '--font-inter' });

export const metadata: Metadata = {
  metadataBase: new URL(getAppUrl()),
  title: { default: brand.name, template: `%s | ${brand.name}` },
  description: brand.tagline,
  applicationName: brand.name,
  // The manifest itself is app/manifest.ts. Safari on iOS reads these instead (PRD 8.1, M4-08).
  appleWebApp: { capable: true, title: brand.shortName, statusBarStyle: 'default' },
  icons: {
    icon: [{ url: '/icons/192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icons/apple-touch-180.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: brand.colours.black,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB" className={inter.variable}>
      <head>
        <BrandStyle />
      </head>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
