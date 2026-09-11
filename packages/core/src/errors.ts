/**
 * Domain error codes shared by the database (RPCs raise them as the error message),
 * the server (typed results) and every client. The UI maps codes to copy.
 */

export const domainErrorCodes = [
  'NOT_AUTHENTICATED',
  'NOT_ALLOWED',
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'RATE_LIMITED',
  'MFA_REQUIRED',
  'READ_ONLY_SESSION',
  'SLOT_TAKEN',
  'TOO_CLOSE',
  'OVERLAP',
  'LEARNER_BUSY',
  'OUTSIDE_AVAILABILITY',
  'NOTICE_TOO_SHORT',
  'BEYOND_HORIZON',
  'INSUFFICIENT_CREDIT',
  'PDI_NOT_LINKED',
  'PAYMENT_FAILED',
  'UNKNOWN',
] as const;

export type DomainErrorCode = (typeof domainErrorCodes)[number];

const codeSet: ReadonlySet<string> = new Set(domainErrorCodes);

export function isDomainErrorCode(value: unknown): value is DomainErrorCode {
  return typeof value === 'string' && codeSet.has(value);
}

/** Default copy when a screen has nothing more specific to say. Plain British English. */
export const defaultErrorCopy: Record<DomainErrorCode, string> = {
  NOT_AUTHENTICATED: 'Sign in to carry on.',
  NOT_ALLOWED: 'You do not have permission to do that.',
  NOT_FOUND: 'We could not find that.',
  VALIDATION_FAILED: 'Check the highlighted fields.',
  RATE_LIMITED: 'Too many attempts. Try again in a minute.',
  MFA_REQUIRED: 'Confirm it is you with your authenticator app.',
  READ_ONLY_SESSION: 'You are viewing as someone else. Changes are turned off.',
  SLOT_TAKEN: 'This slot was just taken.',
  TOO_CLOSE: 'Too close to another lesson.',
  OVERLAP: 'This clashes with another lesson.',
  LEARNER_BUSY: 'The learner already has a lesson then.',
  OUTSIDE_AVAILABILITY: 'This time is not available.',
  NOTICE_TOO_SHORT: 'This is too soon to book online.',
  BEYOND_HORIZON: 'This is too far ahead to book.',
  INSUFFICIENT_CREDIT: 'Not enough lesson credit.',
  PDI_NOT_LINKED: 'Trainee instructors need a supervising school or instructor first.',
  PAYMENT_FAILED: 'The payment did not go through.',
  UNKNOWN: 'Something went wrong. Try again.',
};

/** Minimal shape of a Postgres or PostgREST error, so this module needs no SDK import. */
export interface PostgresErrorLike {
  code?: string | null;
  message?: string | null;
  details?: string | null;
}

const SQLSTATE_TO_CODE: Record<string, DomainErrorCode> = {
  '23P01': 'SLOT_TAKEN', // exclusion_violation: a concurrent booking won the slot (R-02)
  '42501': 'NOT_ALLOWED', // insufficient_privilege, including RLS write denials
  PGRST116: 'NOT_FOUND', // PostgREST: no row for .single()
  PGRST301: 'NOT_AUTHENTICATED', // PostgREST: JWT invalid or expired
};

export interface ParsedDomainError {
  code: DomainErrorCode;
  /** JSON context raised by the RPC in DETAIL, for example the clashing lesson's start time. */
  context: Record<string, unknown>;
}

function parseContext(details: string | null | undefined): Record<string, unknown> {
  if (!details) return {};
  try {
    const value: unknown = JSON.parse(details);
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * RPCs raise `raise exception using message = 'SLOT_TAKEN', detail = '{"starts_at": ...}'`.
 * Known SQLSTATEs map to codes. Anything else is UNKNOWN, so raw database text never
 * reaches a user.
 */
export function parsePostgresError(error: PostgresErrorLike): ParsedDomainError {
  const message = error.message?.trim() ?? '';
  if (isDomainErrorCode(message)) return { code: message, context: parseContext(error.details) };
  const mapped = error.code ? SQLSTATE_TO_CODE[error.code] : undefined;
  return { code: mapped ?? 'UNKNOWN', context: {} };
}
