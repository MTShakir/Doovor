import { Button, Heading, Link, Section, Text } from '@react-email/components';
import { render } from '@react-email/render';
import { brand } from '@repo/config/brand';
import { createElement } from 'react';
import { EmailLayout, emailStyles } from './layout.tsx';

/**
 * The emails Supabase Auth sends itself (AUTH-01, AUTH-02, D-258): confirming an email when somebody
 * signs up, a sign-in link, a new password, and a new email address.
 *
 * Auth writes the link, not the app, so these are never sent from here. Each is rendered once into
 * a template with Auth's own placeholders in it, `{{ .TokenHash }}` and the rest, and kept in
 * supabase/templates, which the local stack reads and a hosted push copies across. A test renders
 * them again and fails when a template there has fallen behind this file, so they look like every
 * other email and change with them.
 */
export const authEmailKinds = ['confirmation', 'magic_link', 'recovery', 'email_change'] as const;
export type AuthEmailKind = (typeof authEmailKinds)[number];

/** How long a link in one of these works: Auth's `otp_expiry`, which a test holds to this. */
export const authLinkHours = 1;

interface AuthEmailCopy {
  /** The subject, which Auth's settings carry too. */
  subject: string;
  heading: string;
  lead: string;
  action: string;
  /** What `/auth/confirm` is told the link is for. */
  type: 'email' | 'recovery' | 'email_change';
  /** Why it came, for the footer: "You are getting this because ...". */
  reason: string;
  /** What to do when it was not them. */
  notYou: string;
}

function hoursWords(hours: number): string {
  return hours === 1 ? '1 hour' : `${String(hours)} hours`;
}

const linkLife = `The link works for ${hoursWords(authLinkHours)}.`;

export const authEmailCopy: Record<AuthEmailKind, AuthEmailCopy> = {
  confirmation: {
    subject: 'Confirm your email',
    heading: 'Confirm your email',
    lead: `Thanks for signing up to ${brand.name}. Confirm this is your email address to finish creating your account. ${linkLife}`,
    action: 'Confirm email',
    type: 'email',
    reason: `this email address was used to sign up to ${brand.name}`,
    notYou: 'If you did not sign up, you can ignore this email.',
  },
  magic_link: {
    subject: 'Your sign-in link',
    heading: 'Your sign-in link',
    lead: `Tap the button to sign in to ${brand.name}. The link works once. ${linkLife}`,
    action: 'Sign in',
    type: 'email',
    reason: 'somebody asked for a sign-in link for this email address',
    notYou: 'If you did not ask for this, you can ignore this email. Nobody can sign in without the link.',
  },
  recovery: {
    subject: 'Reset your password',
    heading: 'Reset your password',
    lead: `Tap the button to choose a new password. ${linkLife}`,
    action: 'Choose a new password',
    type: 'recovery',
    reason: 'somebody asked to reset the password for this email address',
    notYou: 'If you did not ask for this, you can ignore this email. Your password stays the same.',
  },
  email_change: {
    subject: 'Confirm your new email',
    heading: 'Confirm your new email',
    lead: `Tap the button to confirm {{ .NewEmail }} as your new email address. ${linkLife}`,
    action: 'Confirm new email',
    type: 'email_change',
    reason: 'somebody asked to change the email address of an account',
    notYou: `If you did not ask for this, you can ignore this email and nothing changes. If you think somebody else has your password, change it, or email ${brand.supportEmail}.`,
  },
};

/** Where the button goes: the app's confirm route, with Auth's token in it. */
export function authLink(kind: AuthEmailKind): string {
  return `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=${authEmailCopy[kind].type}`;
}

const { colours } = emailStyles;

const heading = { color: colours.black, fontSize: '22px', fontWeight: 700, lineHeight: '28px', margin: '0 0 12px' };
const paragraph = { color: colours.ink, fontSize: '16px', lineHeight: '24px', margin: '0 0 16px' };
const small = { color: colours['grey-700'], fontSize: '14px', lineHeight: '20px', margin: '0 0 8px' };
const button = {
  backgroundColor: colours.black,
  borderRadius: '999px',
  color: colours.white,
  display: 'inline-block',
  fontSize: '16px',
  fontWeight: 600,
  padding: '14px 28px',
  textDecoration: 'none',
};
const rawLink = { color: colours.blue, fontSize: '13px', lineHeight: '20px', textDecoration: 'underline', wordBreak: 'break-all' as const };

export function AuthEmail({ kind }: { kind: AuthEmailKind }) {
  const copy = authEmailCopy[kind];
  const url = authLink(kind);
  return (
    <EmailLayout preview={copy.lead} reason={copy.reason}>
      <Heading style={heading}>{copy.heading}</Heading>
      <Text style={paragraph}>{copy.lead}</Text>
      {/* The first link in the email: the end to end tests follow it, and so does a person. */}
      <Section style={{ padding: '4px 0 20px' }}>
        <Button href={url} style={button}>
          {copy.action}
        </Button>
      </Section>
      <Text style={small}>{copy.notYou}</Text>
      <Text style={{ ...small, margin: '16px 0 4px' }}>If the button does not work, copy this link into your browser:</Text>
      <Text style={{ margin: '0' }}>
        <Link href={url} style={rawLink}>
          {url}
        </Link>
      </Text>
    </EmailLayout>
  );
}

/** One of Auth's templates, as the HTML its settings are given. */
export async function renderAuthTemplate(kind: AuthEmailKind): Promise<string> {
  return render(createElement(AuthEmail, { kind }));
}
