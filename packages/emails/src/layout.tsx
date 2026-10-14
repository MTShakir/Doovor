import { Body, Container, Head, Hr, Html, Img, Link, Preview, Section, Text } from '@react-email/components';
import { brand, companyDisclosure } from '@repo/config/brand';
import { horizontalLogo } from '@repo/config/logo/horizontal';
import type { ReactNode } from 'react';

/**
 * The logo at the top of every email (D-249). Email cannot show SVG, so it is a picture the app
 * draws at twice this size from the logo's own shapes, at this address. It sits on the email's
 * grey with that grey painted in, so a mail app that darkens the background cannot leave a black
 * logo on black. With pictures turned off, the name shows in its place.
 */
export const emailLogo = {
  path: '/brand/email-logo.png',
  height: 28,
  width: Math.round((28 * horizontalLogo.width) / horizontalLogo.height),
  scale: 2,
} as const;

/** The same picture, smaller, signing off the footer (D-258). */
export const footerLogo = {
  height: 20,
  width: Math.round((20 * horizontalLogo.width) / horizontalLogo.height),
} as const;

/**
 * The pages somebody may want from any email: what we do with their data, the two sets of terms,
 * and the site itself. Whole addresses, because an email has no page to be relative to.
 */
export const footerLinks = [
  { label: 'Privacy notice', url: `${brand.productionUrl}/privacy` },
  { label: 'Terms for learners', url: `${brand.productionUrl}/terms` },
  { label: 'Terms for instructors', url: `${brand.productionUrl}/business-terms` },
  { label: brand.domain, url: brand.productionUrl },
] as const;

/**
 * The shell every email shares (NTF-03, PRD 7.2).
 *
 * Email has no stylesheet and no Tailwind, so the tokens come from brand.ts directly rather
 * than being hard coded here: the same black, the same greys, the same rules about contrast.
 */
export interface EmailLayoutProps {
  /** The line a mail client shows next to the subject. */
  preview: string;
  children: ReactNode;
  /** Where to change what they hear about (NTF-04). */
  settingsUrl?: string;
  /** Why they are getting it, when that is not their account: "you joined the waiting list for LS". */
  reason?: string;
}

const colours = brand.colours;

const body = {
  backgroundColor: colours['grey-100'],
  color: colours.ink,
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  margin: '0',
  padding: '24px 0',
};

const container = { margin: '0 auto', maxWidth: '560px', padding: '0 16px', width: '100%' };

// Also how the name looks where a mail app shows it instead of the picture.
const logo = { display: 'block', border: '0', color: colours.black, fontSize: '20px', fontWeight: 700, margin: '0 0 16px' };

const card = {
  backgroundColor: colours.white,
  border: `1px solid ${colours['grey-200']}`,
  borderRadius: '16px',
  padding: '24px',
};

const rule = { borderColor: colours['grey-200'], margin: '24px 0 16px' };

const footnote = { color: colours['grey-700'], fontSize: '13px', lineHeight: '20px', margin: '0 0 8px' };

const link = { color: colours.blue, textDecoration: 'underline' };

const signOff = { display: 'block', border: '0', color: colours.black, fontSize: '15px', fontWeight: 700, margin: '16px 0 4px' };

const slogan = { color: colours.ink, fontSize: '13px', fontWeight: 600, lineHeight: '20px', margin: '0 0 12px' };

const quietLink = { color: colours.ink, textDecoration: 'underline' };

/**
 * Who sends it, as the law asks a company's emails to say: its registered name, number, where it
 * is registered and its registered office, and its entry in the ICO's register (D-258).
 */
export const ownership = `${brand.name} is owned and run by ${companyDisclosure()} Registered with the Information Commissioner's Office, number ${brand.icoRegistration}.`;

export function EmailLayout({ preview, children, settingsUrl, reason }: EmailLayoutProps) {
  return (
    <Html lang="en-GB">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Img src={`${brand.appUrl}${emailLogo.path}`} width={emailLogo.width} height={emailLogo.height} alt={brand.name} style={logo} />
          <Section style={card}>{children}</Section>
          <Hr style={rule} />
          <Text style={footnote}>
            You are getting this because {reason ?? `you have a ${brand.name} account`}.
            {settingsUrl ? (
              <>
                {' '}
                <Link href={settingsUrl} style={link}>
                  Choose what you hear about
                </Link>
                .
              </>
            ) : null}
          </Text>
          <Text style={footnote}>
            Need help? Email us at{' '}
            <Link href={`mailto:${brand.supportEmail}`} style={link}>
              {brand.supportEmail}
            </Link>{' '}
            and we will get back to you.
          </Text>
          <Img
            src={`${brand.appUrl}${emailLogo.path}`}
            width={footerLogo.width}
            height={footerLogo.height}
            alt={brand.name}
            style={signOff}
          />
          <Text style={slogan}>{brand.slogan}</Text>
          <Text style={footnote}>
            {footerLinks.map((one, index) => (
              <span key={one.url}>
                {index === 0 ? null : ' · '}
                <Link href={one.url} style={quietLink}>
                  {one.label}
                </Link>
              </span>
            ))}
          </Text>
          <Text style={footnote}>{ownership}</Text>
        </Container>
      </Body>
    </Html>
  );
}

export const emailStyles = { colours, card, footnote, link };
