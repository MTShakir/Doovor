import { brand } from '@repo/config/brand';
import Link from 'next/link';
import type { ReactNode } from 'react';

// Gated by the session: the shell is instant, the content may block on the gate (D-029).
export const instant = false;

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-white">
      <header className="px-4 py-4 md:px-8">
        <Link href="/" className="text-h3 text-black">
          {brand.name}
        </Link>
      </header>
      <main className="mx-auto w-full max-w-2xl px-4 pb-16 md:px-8">{children}</main>
    </div>
  );
}
