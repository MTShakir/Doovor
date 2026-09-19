import { Body, Container, Head, Hr, Html, Link, Preview, Section, Text } from '@react-email/components';
import { brand, companyDisclosure } from '@repo/config/brand';
import type { ReactNode } from 'react';

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

const wordmark = { color: colours.black, fontSize: '20px', fontWeight: 700, margin: '0 0 16px' };

const card = {
  backgroundColor: colours.white,
  border: `1px solid ${colours['grey-200']}`,
  borderRadius: '16px',
  padding: '24px',
};

const rule = { borderColor: colours['grey-200'], margin: '24px 0 16px' };

const footnote = { color: colours['grey-700'], fontSize: '13px', lineHeight: '20px', margin: '0 0 8px' };

const link = { color: colours.blue, textDecoration: 'underline' };

export function EmailLayout({ preview, children, settingsUrl, reason }: EmailLayoutProps) {
  return (
    <Html lang="en-GB">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Text style={wordmark}>{brand.name}</Text>
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
          <Text style={footnote}>{companyDisclosure()}</Text>
        </Container>
      </Body>
    </Html>
  );
}

export const emailStyles = { colours, card, footnote, link };
