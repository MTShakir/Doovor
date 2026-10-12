import { brand } from '@repo/config/brand';
import { horizontalLogo } from '@repo/config/logo/horizontal';
import { Logo } from '@repo/ui/logo';
import type { ReactNode } from 'react';

// Gated by the session: the shell is instant, the content waits for the gate (D-038).
export const instant = false;

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="px-4 py-4 md:px-8">
        <div className="flex min-h-12 items-center">
          <Logo art={horizontalLogo} label={brand.name} className="h-8 text-black" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-xl px-4 pb-16 md:px-8">{children}</main>
    </div>
  );
}
