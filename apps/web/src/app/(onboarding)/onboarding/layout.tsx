import { brand } from '@repo/config/brand';
import type { ReactNode } from 'react';

// Gated by the session: the shell is instant, the content waits for the gate (D-038).
export const instant = false;

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-white">
      <header className="px-4 py-4 md:px-8">
        <span className="text-h3 text-black">{brand.name}</span>
      </header>
      <main className="mx-auto w-full max-w-xl px-4 pb-16 md:px-8">{children}</main>
    </div>
  );
}
