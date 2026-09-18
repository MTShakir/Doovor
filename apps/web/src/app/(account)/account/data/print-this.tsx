'use client';

import { Button } from '@repo/ui/button';
import { Printer } from 'lucide-react';

/**
 * Saves this page as a PDF, the way a receipt already is (M6-11, D-148): every browser and phone
 * can print a page to a PDF, and it is the same page a person has just read.
 */
export function PrintThis() {
  return (
    <Button
      onClick={() => {
        window.print();
      }}
    >
      <Printer className="size-5" aria-hidden />
      Save as PDF
    </Button>
  );
}
