import { expect } from '@playwright/test';

/** Local mailbox that catches every email from the local Supabase stack (port 54324). */
const MAILPIT = process.env.E2E_MAILPIT_URL ?? 'http://127.0.0.1:54324';

interface MailpitSummary {
  ID: string;
  Subject: string;
  Created: string;
}

async function latestMessageTo(address: string, subject: string): Promise<MailpitSummary | undefined> {
  const response = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`);
  if (!response.ok) return undefined;
  const body = (await response.json()) as { messages?: MailpitSummary[] };
  return (body.messages ?? []).find((m) => m.Subject.includes(subject));
}

/** Waits for an email and returns the first link in it (templates link to the app's site URL). */
export async function linkFromEmail(address: string, subject: string): Promise<string> {
  let message: MailpitSummary | undefined;
  await expect
    .poll(async () => {
      message = await latestMessageTo(address, subject);
      return message !== undefined;
    }, { message: `email "${subject}" to ${address}`, timeout: 15_000 })
    .toBe(true);
  if (!message) throw new Error('unreachable');
  const detail = (await (await fetch(`${MAILPIT}/api/v1/message/${message.ID}`)).json()) as { HTML: string };
  const href = /href="([^"]+)"/.exec(detail.HTML)?.[1]?.replaceAll('&amp;', '&');
  if (!href) throw new Error(`No link in email "${subject}" to ${address}`);
  if (!href.includes('/auth/confirm?token_hash=')) {
    throw new Error(`Email "${subject}" does not use our template (got ${href}). Restart the stack: pnpm db:stop && pnpm db:start`);
  }
  return href;
}
