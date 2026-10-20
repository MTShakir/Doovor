import {
  BadgeCheck,
  Building2,
  CreditCard,
  Gift,
  IdCard,
  MapPin,
  MessageCircle,
  MessageSquare,
  MessageSquarePlus,
  MessagesSquare,
  Receipt,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';

/**
 * The one icon for each thing the app reaches from more than one place (D-273). The menus, the
 * navigation, a button on a page and the header show the same thing with the same picture, so
 * nobody takes one screen for two, and no picture stands for two things. Add a thing here before
 * giving it an icon in a second place.
 */
export const icons = {
  /** Account and security: the password, devices and two-step verification. */
  account: ShieldCheck,
  /** Tell us something, from the menus and the header, and the inbox staff read it in. */
  feedback: MessageSquarePlus,
  /** How learners pay a Business, and what their receipts say. */
  paymentSetup: CreditCard,
  /** A badge staff have checked, and the queue of badges to check. */
  verification: BadgeCheck,
  learners: Users,
  instructors: IdCard,
  /** A driving school: the one a linked instructor works with, and the school's own way of selling (D-282). */
  school: Building2,
  pickupPoints: MapPin,
  bookkeeping: Receipt,
  refer: Gift,
  /** Messages between an instructor and a learner inside the app. */
  messages: MessagesSquare,
  whatsApp: MessageCircle,
  /** A text message to a phone. */
  text: MessageSquare,
} as const satisfies Record<string, LucideIcon>;
