import type { Route } from 'next';
import Link from 'next/link';
import type { ComponentProps } from 'react';

/** Adapts Next.js Link to the plain anchor props the UI package's navigation expects. */
export function NavLink({ href, ...props }: ComponentProps<'a'>) {
  return <Link href={(href ?? '/') as Route} {...props} />;
}
