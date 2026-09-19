import type { LucideIcon } from 'lucide-react';
import type { ComponentProps, ElementType, ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  active?: boolean;
}

type LinkLike = ElementType<ComponentProps<'a'>>;

interface NavProps {
  items: NavItem[];
  /** The app's link component (for example Next.js Link). The UI package cannot import it. */
  linkComponent?: LinkLike;
}

/** Mobile bottom tabs (PRD 8.2). Hidden from the md breakpoint, where Sidebar takes over. */
export function BottomTabBar({ items, linkComponent: Link = 'a' }: NavProps) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-grey-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${String(items.length)}, minmax(0, 1fr))` }}>
        {items.map(({ href, label, icon: Icon, active = false }) => (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-16 flex-col items-center justify-center gap-1 text-caption transition-colors duration-200',
                'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-black',
                active ? 'font-semibold text-black' : 'font-medium text-grey-700 hover:text-black',
              )}
            >
              <Icon size={24} strokeWidth={active ? 2 : 1.5} aria-hidden />
              {/* A tab is a fixed share of the screen, so a label that outgrows it is shortened. */}
              <span className="max-w-full truncate px-1">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

interface SidebarProps extends NavProps {
  header: ReactNode;
  footer?: ReactNode;
}

/** Desktop sidebar (PRD 8.2). */
export function Sidebar({ items, header, footer, linkComponent: Link = 'a' }: SidebarProps) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-grey-200 bg-white px-3 py-5 md:flex">
      <div className="px-3 pb-6">{header}</div>
      <nav aria-label="Main" className="flex-1 overflow-y-auto">
        <ul className="flex flex-col gap-1">
          {items.map(({ href, label, icon: Icon, active = false }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-12 items-center gap-3 rounded-full px-3 text-body transition-colors duration-200',
                  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-black',
                  active ? 'bg-grey-100 font-semibold text-black' : 'text-ink hover:bg-grey-100',
                )}
              >
                <Icon size={24} strokeWidth={1.5} aria-hidden />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {footer ? <div className="border-t border-grey-200 pt-3">{footer}</div> : null}
    </aside>
  );
}

/**
 * The bar across the top of a phone's screen: the name on the left, and what belongs at the top
 * right, the notification bell (D-159). From the md breakpoint the sidebar carries both instead.
 */
export function MobileTopBar({ title, actions }: { title: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex min-h-14 items-center justify-between gap-2 border-b border-grey-200 bg-white pt-[env(safe-area-inset-top)] pr-2 pl-4 md:hidden">
      <span className="text-h3 text-black">{title}</span>
      {actions ? <div className="flex items-center gap-1">{actions}</div> : null}
    </header>
  );
}

/** Page frame that leaves room for the sidebar on desktop and the tab bar on phones. */
export function AppShell({
  sidebar,
  topBar,
  tabBar,
  banner,
  children,
}: {
  sidebar?: ReactNode;
  /** The phone's top bar (MobileTopBar), before the content so skipping to it skips the bar too. */
  topBar?: ReactNode;
  tabBar?: ReactNode;
  /** Full-width notice above everything, for example the "Viewing as" banner (ADM-06). */
  banner?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-white">
      {banner}
      {/* Past the navigation in one press, for somebody on a keyboard or a screen reader (M6-06).
          The target is focusable, so the keyboard lands there too and the next press carries on
          inside the screen rather than back at the top. Each screen has its own main element, so
          this one is a plain region and not a second landmark. */}
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-30 focus:rounded-full focus:bg-black focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      {sidebar}
      {topBar}
      <div
        id="content"
        tabIndex={-1}
        className={cn(sidebar && 'md:pl-64', tabBar && 'pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0')}
      >
        {children}
      </div>
      {tabBar}
    </div>
  );
}

/** Screen title with an optional back link and actions. Large titles, Uber style. */
export function PageHeader({ title, subtitle, back, actions }: { title: string; subtitle?: ReactNode; back?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-col gap-1 px-4 pt-4 pb-2 md:px-8 md:pt-8">
      {back ? <div className="-ml-3 mb-1">{back}</div> : null}
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-h1 text-black">{title}</h1>
          {subtitle ? <p className="text-small text-grey-700">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
