/**
 * The single source of the brand. Name, domain, contact addresses and colours are defined
 * here and nowhere else. A CI guard (scripts/check-copy.mjs) fails the build if any of
 * these values appear elsewhere in apps/, packages/ or supabase/.
 *
 * Changing these lines changes every URL, sender, support address and piece of copy in the
 * product. That is the point of this file (D-076). The public site is the bare domain; the
 * app, and everything somebody signs in to, is on its own host (D-084).
 */

const name = 'Doovor';
const domain = 'doovor.com';
const appHost = `app.${domain}`;

export const brand = {
  name,
  shortName: name,
  tagline: 'Book, pay and track driving lessons in one simple app.',
  legalEntity: 'Maxterz LTD',
  domain,
  appHost,
  /** The public site: the landing page now, pricing and the blog later. */
  productionUrl: `https://${domain}`,
  /** The app: signing in, the portals, paying, booking links, and every link in an email. */
  appUrl: `https://${appHost}`,
  supportEmail: `support@${domain}`,
  email: {
    fromName: name,
    fromAddress: `hello@${domain}`,
    replyTo: `support@${domain}`,
  },
  sms: {
    /** UK alphanumeric sender ID: 3 to 11 characters, letters and digits only. */
    senderId: name.slice(0, 11),
  },
  /** PRD 7.2 colour tokens. Components use Tailwind utilities, never these hex values. */
  colours: {
    black: '#000000',
    ink: '#1A1A1A',
    'grey-700': '#545454',
    'grey-400': '#AFAFAF',
    'grey-200': '#E2E2E2',
    'grey-100': '#F3F3F3',
    white: '#FFFFFF',
    yellow: '#FFD400',
    red: '#E11900',
    blue: '#276EF1',
    green: '#05A357',
  },
} as const;

export type Brand = typeof brand;
export type ColourToken = keyof Brand['colours'];
