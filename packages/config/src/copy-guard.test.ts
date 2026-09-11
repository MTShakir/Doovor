import { describe, expect, it } from 'vitest';
import { brand } from './brand.ts';
import { BRAND_SOURCE, findViolations, formatViolation, isInScope } from './copy-guard.ts';

// Violations are built at runtime so this test file never trips the guard itself.
const emDash = String.fromCharCode(0x2014);
const enDash = String.fromCharCode(0x2013);

describe('copy guard', () => {
  it('flags the brand name outside brand.ts, in any case', () => {
    const content = `export const title = 'Welcome to ${brand.name.toLowerCase()}';`;
    const found = findViolations('apps/web/src/app/page.tsx', content);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ rule: 'brand', line: 1, detail: 'brand name' });
  });

  it('flags the domain and support email', () => {
    const found = findViolations('packages/emails/src/footer.tsx', `mailto:${brand.supportEmail}`);
    expect(found.map((v) => v.detail)).toContain('brand domain');
  });

  it('flags raw brand hex colours but not other hex values', () => {
    const content = `const a = '${brand.colours.yellow.toLowerCase()}';\nconst b = '#123456';`;
    const found = findViolations('packages/ui/src/button.tsx', content);
    expect(found).toHaveLength(1);
    expect(found[0]?.detail).toBe('brand colour yellow');
  });

  it('does not treat a longer hex value as a brand colour', () => {
    expect(findViolations('packages/ui/src/x.ts', `const c = '${brand.colours.black}AA';`)).toHaveLength(0);
  });

  it('flags em and en dashes with their position', () => {
    const content = `ok\nBook now ${emDash} it's quick\n9${enDash}5`;
    const found = findViolations('apps/web/src/copy.ts', content);
    expect(found).toHaveLength(2);
    expect(found[0]).toMatchObject({ rule: 'dash', line: 2, column: 10 });
    expect(found[1]).toMatchObject({ rule: 'dash', line: 3 });
  });

  it('allows brand values in brand.ts but still bans dashes there', () => {
    expect(findViolations(BRAND_SOURCE, `const name = '${brand.name}';`)).toHaveLength(0);
    expect(findViolations(BRAND_SOURCE, `// a ${emDash} b`)).toHaveLength(1);
  });

  it('scopes to product source folders and text files', () => {
    expect(isInScope('apps/web/src/app/page.tsx')).toBe(true);
    expect(isInScope('supabase/migrations/0001_init.sql')).toBe(true);
    expect(isInScope('docs/ARCHITECTURE.md')).toBe(false);
    expect(isInScope('packages/ui/public/logo.png')).toBe(false);
    expect(isInScope('packages/ui/node_modules/x/index.js')).toBe(false);
  });

  it('skips developer and agent instruction files but keeps content files', () => {
    expect(isInScope('apps/web/AGENTS.md')).toBe(false);
    expect(isInScope('apps/web/CLAUDE.md')).toBe(false);
    expect(isInScope('packages/ui/README.md')).toBe(false);
    expect(isInScope('apps/web/content/guides/how-to-book-driving-test.mdx')).toBe(true);
  });

  it('explains how to fix each violation', () => {
    const [v] = findViolations('apps/web/a.ts', `x ${emDash} y`);
    expect(v && formatViolation(v)).toContain('use a comma, colon or full stop instead');
  });
});
