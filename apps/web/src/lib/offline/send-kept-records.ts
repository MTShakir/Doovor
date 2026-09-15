import { sendOutbox, type SendReport } from './outbox';

/**
 * Sending the records kept on the phone, from wherever on the device gets there first (PRG-09,
 * M4-11): the service worker when the browser wakes it for Background Sync, or a page when the
 * signal comes back or the app is looked at, which is the only way on an iPhone.
 */

/** What the service worker is woken with, once the signal is back, to send the kept records. */
export const syncTag = 'lesson-records';

/** Where the phone's screens hear that the outbox changed, whoever changed it. */
export const outboxChannel = 'lesson-outbox';

/** Tells every screen on the device that the outbox changed. */
export function announceOutboxChange(): void {
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel(outboxChannel);
  channel.postMessage({ type: 'changed' });
  channel.close();
}

export interface SendOptions {
  /** The device's lock manager, so a tab and the service worker never send at the same time. */
  locks?: LockManager;
  /** Wait for whoever is sending to finish, rather than leave it to them. */
  wait?: boolean;
  fetcher?: typeof fetch;
}

/**
 * Sends one person's waiting records, unless a tab or the service worker on this device already is
 * and `wait` is not set: two senders at once would only send the same records twice. Null when it
 * left the sending to another.
 */
export async function sendKeptRecords(owner: string, { locks, wait = false, fetcher = fetch }: SendOptions = {}): Promise<SendReport | null> {
  const send = async (): Promise<SendReport> => {
    const report = await sendOutbox(owner, fetcher);
    if (report.sent.length + report.conflicts.length + report.refused.length > 0) announceOutboxChange();
    return report;
  };
  if (locks === undefined) return send();
  if (wait) return locks.request('lesson-outbox', send);
  return locks.request('lesson-outbox', { ifAvailable: true }, (lock) => (lock === null ? null : send()));
}

/** Asks the browser to wake the service worker to send once the signal is back, where it can. */
export async function sendWhenSignalReturns(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  // Safari has no Background Sync: its pages send when the signal is back or the app is looked at.
  if (registration === undefined || !('sync' in registration)) return;
  await registration.sync.register(syncTag).catch(() => undefined);
}
