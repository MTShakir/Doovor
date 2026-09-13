import { Button, Heading, Section, Text } from '@react-email/components';
import { EmailLayout, emailStyles } from './layout.tsx';

export interface NotificationFact {
  label: string;
  value: string;
}

export interface NotificationEmailProps {
  /** The line at the top, and the subject: the same words the app shows (NTF-03). */
  title: string;
  body: string;
  /** "Hello Jack", when the name is known. */
  greeting?: string;
  /** What, when and with whom, laid out so it can be read at a glance. */
  facts?: NotificationFact[];
  action?: { label: string; url: string };
  settingsUrl?: string;
}

const { colours } = emailStyles;

const heading = { color: colours.black, fontSize: '22px', fontWeight: 700, lineHeight: '28px', margin: '0 0 12px' };
const paragraph = { color: colours.ink, fontSize: '16px', lineHeight: '24px', margin: '0 0 16px' };
const factRow = { borderTop: `1px solid ${colours['grey-200']}`, padding: '10px 0' };
const factLabel = { color: colours['grey-700'], fontSize: '13px', lineHeight: '18px', margin: '0' };
const factValue = { color: colours.black, fontSize: '16px', fontWeight: 600, lineHeight: '22px', margin: '0' };
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

/**
 * Every email the platform sends about a notification (NTF-03). One template, because the
 * words come from the catalogue in packages/core: an email that says something different
 * from the app is an email that is wrong.
 */
export function NotificationEmail({ title, body, greeting, facts, action, settingsUrl }: NotificationEmailProps) {
  return (
    <EmailLayout preview={body} settingsUrl={settingsUrl}>
      {greeting ? <Text style={paragraph}>{greeting}</Text> : null}
      <Heading style={heading}>{title}</Heading>
      <Text style={paragraph}>{body}</Text>
      {facts && facts.length > 0 ? (
        <Section>
          {facts.map((fact) => (
            <Section key={fact.label} style={factRow}>
              <Text style={factLabel}>{fact.label}</Text>
              <Text style={factValue}>{fact.value}</Text>
            </Section>
          ))}
        </Section>
      ) : null}
      {action ? (
        <Section style={{ paddingTop: '20px' }}>
          <Button href={action.url} style={button}>
            {action.label}
          </Button>
        </Section>
      ) : null}
    </EmailLayout>
  );
}
