import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { termsVersion } from '@repo/core/legal';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..', '..', '..', '..', '..');

describe('the terms version the test accounts agreed to (D-265)', () => {
  it('is the current one, so the accounts the database tests and end to end tests make are not stopped to agree', () => {
    const helpers = readFileSync(join(root, 'supabase', 'seeds', 'test_helpers.sql'), 'utf8');
    const versions = [...helpers.matchAll(/'terms_version', '(\d{4}-\d{2}-\d{2})'/g)].map((match) => match[1]);
    expect(versions).toHaveLength(2);
    for (const version of versions) expect(version).toBe(termsVersion);
  });
});
