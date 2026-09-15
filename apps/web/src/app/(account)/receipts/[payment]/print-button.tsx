'use client';

import { Button } from '@repo/ui/button';
import { Printer } from 'lucide-react';

/** Prints the receipt: everything but the receipt itself is left off the page. */
export function PrintButton() {
  return (
    <Button variant="secondary" onClick={() => { window.print(); }}>
      <Printer className="size-5" aria-hidden />
      Print
    </Button>
  );
}
