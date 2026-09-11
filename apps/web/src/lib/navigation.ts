import {
  BarChart3,
  Building2,
  CalendarDays,
  Car,
  ClipboardList,
  CreditCard,
  FileText,
  Gavel,
  Home,
  Layers,
  LayoutDashboard,
  ListChecks,
  MapPinned,
  Menu,
  PoundSterling,
  ScrollText,
  Settings,
  ShieldCheck,
  Star,
  Sun,
  TrendingUp,
  User,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';

export type Portal = 'learner' | 'instructor' | 'school' | 'admin';

export interface PortalNavItem {
  /** Path segment under the portal root. Empty string is the portal home. */
  section: string;
  label: string;
  icon: LucideIcon;
  mobile: boolean;
  desktop: boolean;
  /** Destinations for later phases stay hidden until built (D-030). */
  phase: 1 | 2;
}

export const portalRoots: Record<Portal, string> = {
  learner: '/app/learner',
  instructor: '/app/instructor',
  school: '/app/school',
  admin: '/admin',
};

/** PRD 8.2 navigation. */
const navigation: Record<Portal, PortalNavItem[]> = {
  learner: [
    { section: '', label: 'Home', icon: Home, mobile: true, desktop: true, phase: 1 },
    { section: 'lessons', label: 'Lessons', icon: CalendarDays, mobile: true, desktop: true, phase: 1 },
    { section: 'progress', label: 'Progress', icon: TrendingUp, mobile: true, desktop: true, phase: 1 },
    { section: 'payments', label: 'Payments', icon: CreditCard, mobile: false, desktop: true, phase: 1 },
    { section: 'account', label: 'Account', icon: User, mobile: true, desktop: true, phase: 1 },
  ],
  instructor: [
    { section: '', label: 'Today', icon: Sun, mobile: true, desktop: true, phase: 1 },
    { section: 'diary', label: 'Diary', icon: CalendarDays, mobile: true, desktop: true, phase: 1 },
    { section: 'learners', label: 'Learners', icon: Users, mobile: true, desktop: true, phase: 1 },
    { section: 'money', label: 'Money', icon: PoundSterling, mobile: true, desktop: true, phase: 1 },
    { section: 'waiting-list', label: 'Waiting list', icon: ListChecks, mobile: false, desktop: true, phase: 2 },
    { section: 'profile', label: 'Profile', icon: UserRound, mobile: false, desktop: true, phase: 1 },
    { section: 'settings', label: 'Settings', icon: Settings, mobile: false, desktop: true, phase: 1 },
    { section: 'more', label: 'More', icon: Menu, mobile: true, desktop: false, phase: 1 },
  ],
  school: [
    { section: '', label: 'Overview', icon: LayoutDashboard, mobile: true, desktop: true, phase: 1 },
    { section: 'diary', label: 'Diary', icon: CalendarDays, mobile: true, desktop: true, phase: 1 },
    { section: 'instructors', label: 'Instructors', icon: Users, mobile: true, desktop: true, phase: 1 },
    { section: 'learners', label: 'Learners', icon: UserRound, mobile: true, desktop: true, phase: 1 },
    { section: 'money', label: 'Money', icon: PoundSterling, mobile: false, desktop: true, phase: 1 },
    { section: 'fleet', label: 'Fleet', icon: Car, mobile: false, desktop: true, phase: 2 },
    { section: 'reports', label: 'Reports', icon: BarChart3, mobile: false, desktop: true, phase: 2 },
    { section: 'settings', label: 'Settings', icon: Settings, mobile: false, desktop: true, phase: 1 },
    { section: 'more', label: 'More', icon: Menu, mobile: true, desktop: false, phase: 1 },
  ],
  admin: [
    { section: '', label: 'Dashboard', icon: LayoutDashboard, mobile: false, desktop: true, phase: 1 },
    { section: 'businesses', label: 'Businesses', icon: Building2, mobile: false, desktop: true, phase: 1 },
    { section: 'instructors', label: 'Instructors', icon: Users, mobile: false, desktop: true, phase: 1 },
    { section: 'verification', label: 'Verification', icon: ShieldCheck, mobile: false, desktop: true, phase: 1 },
    { section: 'learners', label: 'Learners', icon: UserRound, mobile: false, desktop: true, phase: 1 },
    { section: 'bookings', label: 'Bookings', icon: ClipboardList, mobile: false, desktop: true, phase: 1 },
    { section: 'payments', label: 'Payments', icon: CreditCard, mobile: false, desktop: true, phase: 1 },
    { section: 'reviews', label: 'Reviews', icon: Star, mobile: false, desktop: true, phase: 2 },
    { section: 'disputes', label: 'Disputes', icon: Gavel, mobile: false, desktop: true, phase: 2 },
    { section: 'regions', label: 'Regions', icon: MapPinned, mobile: false, desktop: true, phase: 1 },
    { section: 'plans', label: 'Plans', icon: Layers, mobile: false, desktop: true, phase: 2 },
    { section: 'content', label: 'Content', icon: FileText, mobile: false, desktop: true, phase: 2 },
    { section: 'settings', label: 'Settings', icon: Settings, mobile: false, desktop: true, phase: 1 },
    { section: 'audit-log', label: 'Audit log', icon: ScrollText, mobile: false, desktop: true, phase: 1 },
  ],
};

const CURRENT_PHASE = 1;

export function navFor(portal: Portal, surface: 'mobile' | 'desktop') {
  return navigation[portal].filter((item) => item[surface] && item.phase <= CURRENT_PHASE);
}

export function hrefFor(portal: Portal, section: string): string {
  return section ? `${portalRoots[portal]}/${section}` : portalRoots[portal];
}

/** Sections that exist in Phase 1 for a portal, used for placeholder routes. */
export function sectionsFor(portal: Portal): string[] {
  return navigation[portal].filter((item) => item.phase <= CURRENT_PHASE && item.section).map((item) => item.section);
}

export function labelFor(portal: Portal, section: string): string {
  return navigation[portal].find((item) => item.section === section)?.label ?? 'Not found';
}

/** The nav item a path belongs to: exact match for the portal home, prefix match otherwise. */
export function isActive(portal: Portal, section: string, pathname: string): boolean {
  const href = hrefFor(portal, section);
  return section === '' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}
