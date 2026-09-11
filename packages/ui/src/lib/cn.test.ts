import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('keeps a text size and a text colour together', () => {
    expect(cn('text-ink', 'text-h1')).toBe('text-ink text-h1');
  });

  it('lets the later size win', () => {
    expect(cn('text-body', 'text-small')).toBe('text-small');
  });

  it('lets the later colour win', () => {
    expect(cn('bg-black text-white', 'bg-grey-100 text-black')).toBe('bg-grey-100 text-black');
  });

  it('merges custom radii and shadows', () => {
    expect(cn('rounded-input', 'rounded-card')).toBe('rounded-card');
    expect(cn('shadow-card', 'shadow-sheet')).toBe('shadow-sheet');
  });

  it('drops falsy values', () => {
    expect(cn('a', false, undefined, null, 'b')).toBe('a b');
  });
});
