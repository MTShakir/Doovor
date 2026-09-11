'use client';

import { brand } from '@repo/config/brand';
import { BottomTabBar, Sidebar } from '@repo/ui/app-shell';
import { usePathname } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { hrefFor, isActive, navFor, type Portal } from '@/lib/navigation';
import { NavLink } from './nav-link';

function items(portal: Portal, surface: 'mobile' | 'desktop', pathname: string | null) {
  return navFor(portal, surface).map((item) => ({
    href: hrefFor(portal, item.section),
    label: item.label,
    icon: item.icon,
    active: pathname !== null && isActive(portal, item.section, pathname),
  }));
}

function sidebar(portal: Portal, pathname: string | null, footer?: ReactNode) {
  return (
    <Sidebar
      items={items(portal, 'desktop', pathname)}
      linkComponent={NavLink}
      header={<span className="text-h3 text-black">{brand.name}</span>}
      footer={footer}
    />
  );
}

function ActiveSidebar({ portal, footer }: { portal: Portal; footer?: ReactNode }) {
  return sidebar(portal, usePathname(), footer);
}

function ActiveTabBar({ portal }: { portal: Portal }) {
  return <BottomTabBar items={items(portal, 'mobile', usePathname())} linkComponent={NavLink} />;
}

/**
 * The navigation renders in the static shell without a current item, then the current item
 * streams in: with Cache Components, reading the URL must sit inside Suspense (D-029).
 */
export function PortalSidebar({ portal, footer }: { portal: Portal; footer?: ReactNode }) {
  return (
    <Suspense fallback={sidebar(portal, null, footer)}>
      <ActiveSidebar portal={portal} footer={footer} />
    </Suspense>
  );
}

export function PortalTabBar({ portal }: { portal: Portal }) {
  if (navFor(portal, 'mobile').length === 0) return null;
  return (
    <Suspense fallback={<BottomTabBar items={items(portal, 'mobile', null)} linkComponent={NavLink} />}>
      <ActiveTabBar portal={portal} />
    </Suspense>
  );
}
