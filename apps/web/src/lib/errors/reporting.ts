import type { ErrorEvent } from '@sentry/nextjs';

/**
 * What we tell the error service, and what we never tell it (NFR-SEC-03, M6-10, D-150).
 *
 * An error report is useful because it carries the state around a mistake, and that is exactly why
 * it has to be read before it is sent: a query string can carry an invitation token, a cookie
 * carries a session, and a form field can carry a password. Sentry is told not to send personal
 * details of its own accord; this takes out the rest, and it is a plain function so a test can hold
 * it to that.
 */

/** Names whose value never leaves the server, whatever it is. */
const secretish = /(password|token|secret|key|authorization|cookie|otp|code|licence|license|dob|date_of_birth)/i;

const removed = '[removed]';

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const request = event.request;
  if (request) {
    // An address without its query: the path says which screen, the query can carry a token.
    if (typeof request.url === 'string') request.url = request.url.split('?')[0] ?? request.url;
    delete request.query_string;
    delete request.cookies;
    delete request.data;
    request.headers = scrubHeaders(request.headers);
  }

  // Sentry works out who somebody is from the request unless told otherwise; only the account's id
  // is ever useful to us, and nothing else about them is.
  if (event.user) event.user = event.user.id === undefined ? {} : { id: event.user.id };

  event.extra = scrubBag(event.extra);
  event.tags = scrubBag(event.tags) as ErrorEvent['tags'];
  return event;
}

/** Sentry's hook, with the shape it asks for. */
export function beforeSend(event: ErrorEvent): ErrorEvent | null {
  return scrubEvent(event);
}

function scrubHeaders(headers: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!headers) return headers;
  const kept: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    kept[name] = secretish.test(name) ? removed : value;
  }
  return kept;
}

function scrubBag(bag: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!bag) return bag;
  const kept: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(bag)) {
    kept[name] = secretish.test(name) ? removed : value;
  }
  return kept;
}
