'use client';

import { brand } from '@repo/config/brand';
import { BottomTabBar, Sidebar } from '@repo/ui/app-shell';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { hrefFor, isActive, navFor, type Portal } from '@/lib/navigation';
import { NavLink } from './nav-link';

function useItems(portal: Portal, surface: 'mobile' | 'desktop') {
  const pathname = usePathname();
  return navFor(portal, surface).map((item) => ({
    href: hrefFor(portal, item.section),
    label: item.label,
    icon: item.icon,
    active: isActive(portal, item.section, pathname),
  }));
}

export function PortalSidebar({ portal, footer }: { portal: Portal; footer?: ReactNode }) {
  const items = useItems(portal, 'desktop');
  return (
    <Sidebar
      items={items}
      linkComponent={NavLink}
      header={<span className="text-h3 text-black">{brand.name}</span>}
      footer={footer}
    />
  );
}

export function PortalTabBar({ portal }: { portal: Portal }) {
  const items = useItems(portal, 'mobile');
  return items.length > 0 ? <BottomTabBar items={items} linkComponent={NavLink} /> : null;
}
