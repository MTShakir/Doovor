import type { ReactNode } from 'react';

/**
 * Every screen of the books says it is in beta (D-198).
 *
 * A tax figure that is quietly wrong is worse than one nobody trusted yet, and these are being
 * checked against real returns. It sits at the top and stays there while the page scrolls, because
 * somebody who scrolled past it once is still looking at the same figures.
 *
 * Yellow carries black text, always (D-009).
 */
export default function BooksLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <p
        role="note"
        className="sticky top-0 z-20 bg-yellow px-4 py-2 text-center text-small font-semibold text-black md:px-8"
      >
        Beta. Check these figures with your accountant before you file.
      </p>
      {children}
    </div>
  );
}
