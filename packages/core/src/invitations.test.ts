import { describe, expect, it } from 'vitest';
import {
  emailShareUrl,
  invitationLink,
  invitationText,
  smsShareUrl,
  whatsappShareUrl,
} from './invitations.ts';

const message = {
  link: 'https://example.test/invite/abc-123',
  instructorName: 'Sarah Khan',
  learnerName: 'Jack',
  phone: '+44 7700 900123',
  email: 'jack@example.test',
};

describe('sharing an invitation (AUTH-07, M2-03)', () => {
  it('says who it is from and what it is for', () => {
    expect(invitationText(message)).toBe(
      'Hi Jack, it is Sarah Khan. Book your driving lessons with me here: https://example.test/invite/abc-123',
    );
  });

  it('manages without a name', () => {
    expect(invitationText({ ...message, learnerName: null })).toContain('Hi, it is Sarah Khan.');
  });

  it('hands WhatsApp the number with nothing but digits', () => {
    expect(whatsappShareUrl(message)).toContain('https://wa.me/447700900123?text=');
    // Without a number, WhatsApp asks who to send it to.
    expect(whatsappShareUrl({ ...message, phone: null })).toContain('https://wa.me/?text=');
  });

  it('opens the messages app with the text written', () => {
    const url = smsShareUrl(message);
    expect(url.startsWith('sms:+44 7700 900123?&body=')).toBe(true);
    expect(decodeURIComponent(url)).toContain('Book your driving lessons');
  });

  it('opens an email with a subject and a body', () => {
    const url = emailShareUrl(message);
    expect(url.startsWith('mailto:jack@example.test?')).toBe(true);
    expect(decodeURIComponent(url)).toContain('Your driving lessons with Sarah Khan');
  });

  it('builds the link one way, so the page and the message agree', () => {
    expect(invitationLink('https://example.test', 'abc-123')).toBe('https://example.test/invite/abc-123');
    expect(invitationLink('https://example.test/', 'a b')).toBe('https://example.test/invite/a%20b');
  });
});
