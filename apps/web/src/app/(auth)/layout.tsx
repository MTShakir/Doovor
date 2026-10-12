import { brand } from '@repo/config/brand';
import { horizontalLogo } from '@repo/config/logo/horizontal';
import { Logo } from '@repo/ui/logo';
import Link from 'next/link';
import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="px-4 py-4 md:px-8">
        <Link href="/" className="inline-flex min-h-12 items-center text-black">
          <Logo art={horizontalLogo} label={brand.name} className="h-10" />
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-4 pb-10 md:pt-10">{children}</main>
    </div>
  );
}
