import { defaultErrorCopy, type DomainErrorCode } from './errors.ts';

/** Every Server Action and Route Handler returns this shape (CLAUDE.md). */
export interface Ok<T> {
  ok: true;
  data: T;
}

export interface Err {
  ok: false;
  code: DomainErrorCode;
  message: string;
  /** Field-level messages for forms, keyed by field name. */
  fields?: Record<string, string>;
}

export type Result<T> = Ok<T> | Err;

export function ok<T>(data: T): Ok<T> {
  return { ok: true, data };
}

export function err(code: DomainErrorCode, message?: string, fields?: Record<string, string>): Err {
  return fields
    ? { ok: false, code, message: message ?? defaultErrorCopy[code], fields }
    : { ok: false, code, message: message ?? defaultErrorCopy[code] };
}
