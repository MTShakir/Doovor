import { Button, Column, Heading, Row, Section, Text } from '@react-email/components';
import type { ReceiptWords } from '@repo/core/receipts';
import { EmailLayout, emailStyles } from './layout.tsx';

export interface ReceiptEmailProps {
  receipt: ReceiptWords;
  /** "Hello Jack", when the name is known. */
  greeting?: string;
  /** The receipt page, to print or keep. */
  url: string;
}

const { colours } = emailStyles;

const heading = { color: colours.black, fontSize: '22px', fontWeight: 700, lineHeight: '28px', margin: '0 0 4px' };
const muted = { color: colours['grey-700'], fontSize: '14px', lineHeight: '20px', margin: '0' };
const paragraph = { color: colours.ink, fontSize: '16px', lineHeight: '24px', margin: '0 0 16px' };
const business = { color: colours.black, fontSize: '16px', fontWeight: 600, lineHeight: '22px', margin: '16px 0 0' };
const row = { borderTop: `1px solid ${colours['grey-200']}`, padding: '12px 0' };
const cell = { color: colours.ink, fontSize: '16px', lineHeight: '22px', margin: '0' };
const amount = { ...cell, textAlign: 'right' as const, whiteSpace: 'nowrap' as const };
const total = { ...cell, color: colours.black, fontWeight: 700 };
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
 * The receipt a learner is sent for a payment (PAY-08): who was paid, with their address, what
 * for, how much, and the VAT in it only when the Business is registered for VAT. The words come
 * from packages/core/src/receipts.ts, which the receipt page uses too.
 */
export function ReceiptEmail({ receipt, greeting, url }: ReceiptEmailProps) {
  return (
    <EmailLayout preview={`${receipt.title} from ${receipt.businessName}: ${receipt.total}`}>
      {greeting ? <Text style={paragraph}>{greeting}</Text> : null}
      <Heading style={heading}>{receipt.title}</Heading>
      <Text style={muted}>{receipt.issuedOn}</Text>

      <Text style={business}>{receipt.businessName}</Text>
      {receipt.addressLines.map((line) => (
        <Text key={line} style={muted}>
          {line}
        </Text>
      ))}
      {receipt.vat ? <Text style={muted}>{receipt.vat.number}</Text> : null}

      <Section style={{ marginTop: '20px' }}>
        <Row style={row}>
          <Column>
            <Text style={cell}>{receipt.line}</Text>
          </Column>
          <Column style={{ width: '96px' }}>
            <Text style={amount}>{receipt.total}</Text>
          </Column>
        </Row>
        {receipt.vat ? (
          <Row style={row}>
            <Column>
              <Text style={cell}>{receipt.vat.label}</Text>
            </Column>
            <Column style={{ width: '96px' }}>
              <Text style={amount}>{receipt.vat.amount}</Text>
            </Column>
          </Row>
        ) : null}
        <Row style={row}>
          <Column>
            <Text style={total}>Total</Text>
            <Text style={muted}>{receipt.paidBy}</Text>
          </Column>
          <Column style={{ width: '96px' }}>
            <Text style={{ ...amount, fontWeight: 700 }}>{receipt.total}</Text>
          </Column>
        </Row>
      </Section>

      <Section style={{ paddingTop: '20px' }}>
        <Button href={url} style={button}>
          See the receipt
        </Button>
      </Section>
    </EmailLayout>
  );
}
