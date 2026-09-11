import { brand } from '@repo/config/brand';
import Link from 'next/link';
import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="px-4 py-4 md:px-8">
        <Link href="/" className="text-h3 text-black">
          {brand.name}
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-4 pb-10 md:pt-10">{children}</main>
    </div>
  );
}
