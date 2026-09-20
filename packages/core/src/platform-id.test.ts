import { describe, expect, it } from 'vitest';
import { isPlatformId, platformId, platformNumberOf } from './platform-id.ts';

describe('the number everybody on the platform has (ADM-02, D-176)', () => {
  it('writes it as D and six digits', () => {
    expect(platformId(1)).toBe('D000001');
    expect(platformId(42)).toBe('D000042');
    expect(platformId(999_999)).toBe('D999999');
  });

  it('grows past six digits rather than starting again', () => {
    expect(platformId(1_000_000)).toBe('D1000000');
  });

  it('reads one back, however it was typed', () => {
    expect(platformNumberOf('D000123')).toBe(123);
    expect(platformNumberOf('d123')).toBe(123);
    expect(platformNumberOf(' 123 ')).toBe(123);
    expect(platformNumberOf('D1000000')).toBe(1_000_000);
  });

  it('reads nothing from what is not one', () => {
    expect(platformNumberOf('Dave')).toBeNull();
    expect(platformNumberOf('')).toBeNull();
    expect(platformNumberOf('D-1')).toBeNull();
    expect(platformNumberOf('12.5')).toBeNull();
    expect(platformNumberOf('D000000')).toBeNull();
  });

  it('knows one when it sees it', () => {
    expect(isPlatformId('D000001')).toBe(true);
    expect(isPlatformId('123')).toBe(true);
    expect(isPlatformId('sarah@example.com')).toBe(false);
  });
});
