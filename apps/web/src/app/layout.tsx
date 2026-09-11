import { brand } from '@repo/config/brand';
import { BrandStyle } from '@repo/ui/brand-style';
import { Toaster } from '@repo/ui/toast';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import { getAppUrl } from '@/lib/app-url';
import './globals.css';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

export const metadata: Metadata = {
  metadataBase: new URL(getAppUrl()),
  title: { default: brand.name, template: `%s | ${brand.name}` },
  description: brand.tagline,
  applicationName: brand.name,
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
