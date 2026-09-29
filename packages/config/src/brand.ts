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
  /** From Companies House: what the company's website and emails must say about it (see companyDisclosure). */
  company: {
    number: '16822859',
    registeredIn: 'England and Wales',
    registeredOffice: '128 City Road, London, United Kingdom, EC1V 2NX',
  },
  /** The company's entry in the ICO's register of data controllers, printed in the privacy notice. */
  icoRegistration: 'ZC165156',
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
    /**
     * What the app is painted on (D-226). Cards, bars and sheets are white and sit on this, so a
     * screen reads as things on a surface rather than one flat sheet. Lighter than grey-100 on
     * purpose: grey-100 stays what it always was, the tint for a chip, a hover or a picture that
     * has not loaded, and those still have to show against this.
     */
    canvas: '#F5F5F7',
    yellow: '#FFD400',
    /** The palest wash of the brand yellow, to mark a Pro surface without shouting (D-209). */
    'yellow-100': '#FFF8DB',
    /**
     * Errors, and what a destructive button is painted with. Darkened from #E11900 with the blue
     * (D-226): the old value was 4.44:1 on the canvas, under the 4.5 text has to clear, so a
     * field's error message failed the moment the ground stopped being white. This clears it on
     * white, on the canvas and on grey-100, and white on it reads better than it did.
     */
    red: '#D81700',
    /**
     * Links, and the one blue in the palette. Darkened from #276EF1 when the app moved onto the
     * canvas (D-226): the old value was 4.58:1 on white, a tenth above the 4.5 it has to clear,
     * and 4.21:1 on the canvas, which is below it. This is 5.19:1 on white and 4.77:1 on the
     * canvas, so it passes on both and has somewhere to go.
     */
    blue: '#2166E0',
    green: '#05A357',
  },
} as const;

export type Brand = typeof brand;
export type ColourToken = keyof Brand['colours'];

/**
 * What a company's website and business emails must say about it: its registered name, number,
 * registered office and where it is registered (The Company, Limited Liability Partnership and
 * Business (Names and Trading Disclosures) Regulations 2015).
 */
export function companyDisclosure(): string {
  return `${brand.legalEntity}, registered in ${brand.company.registeredIn}, company number ${brand.company.number}. Registered office: ${brand.company.registeredOffice}.`;
}
