import type { DomainErrorCode } from '@repo/core/errors';

/** Supabase Auth error codes to plain British English that says what to do next. */
export function authErrorCopy(code: string | undefined): { code: DomainErrorCode; message: string } {
  switch (code) {
    case 'invalid_credentials':
      return { code: 'VALIDATION_FAILED', message: 'Email or password is not right.' };
    case 'email_not_confirmed':
      return { code: 'VALIDATION_FAILED', message: 'Confirm your email first. Use the link we sent you.' };
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
    case 'over_sms_send_rate_limit':
      return { code: 'RATE_LIMITED', message: 'Too many attempts. Try again in a minute.' };
    case 'otp_expired':
      return { code: 'VALIDATION_FAILED', message: 'That code is wrong or has expired. Ask for a new one.' };
    case 'weak_password':
      return { code: 'VALIDATION_FAILED', message: 'Choose a longer password.' };
    case 'phone_exists':
      return { code: 'VALIDATION_FAILED', message: 'That number belongs to another account.' };
    case 'sms_send_failed':
      return { code: 'UNKNOWN', message: 'We could not send a text. Check the number and try again.' };
    case 'same_password':
      return { code: 'VALIDATION_FAILED', message: 'Choose a password you have not used before.' };
    default:
      return { code: 'UNKNOWN', message: 'Something went wrong. Try again.' };
  }
}
