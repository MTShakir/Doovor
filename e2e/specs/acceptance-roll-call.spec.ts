import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * The twelve acceptance tests PRD 17.2 asks for, each by name, all present (M6-15).
 *
 * The tests themselves live with the flows they belong to, which is where they are readable. This
 * is the roll call: if one is renamed, deleted or quietly skipped, the suite fails here and says
 * which. It reads the spec files rather than the test list, so a test that never runs is caught
 * too.
 */
const twelve = [
  'acceptance-01',
  'acceptance-02',
  'acceptance-03',
  'acceptance-04',
  'acceptance-05',
  'acceptance-06',
  'acceptance-07',
  'acceptance-08',
  'acceptance-09',
  'acceptance-10',
  'acceptance-11',
  'acceptance-12',
];

function everySpec(): { name: string; text: string }[] {
  const here = path.join(import.meta.dirname);
  return readdirSync(here)
    .filter((name) => name.endsWith('.spec.ts'))
    .map((name) => ({ name, text: readFileSync(path.join(here, name), 'utf8') }));
}

test.describe('the twelve acceptance tests (PRD 17.2, M6-15) @desktop-only', () => {
  const specs = everySpec();

  test('each one is there, exactly once, as a test that runs', () => {
    const missing: string[] = [];
    const twice: string[] = [];
    for (const name of twelve) {
      const declared = specs.flatMap((spec) => [...spec.text.matchAll(new RegExp(`test\\('${name}:`, 'g'))].map(() => spec.name));
      if (declared.length === 0) missing.push(name);
      if (declared.length > 1) twice.push(`${name} in ${declared.join(', ')}`);
    }
    expect(missing, 'these acceptance tests are missing').toEqual([]);
    expect(twice, 'these acceptance tests are declared more than once').toEqual([]);
  });

  test('none of them is skipped or left as only', () => {
    const wrong: string[] = [];
    for (const spec of specs) {
      for (const name of twelve) {
        if (new RegExp(`test\\.(skip|fixme|only)\\('${name}:`).test(spec.text)) wrong.push(`${name} in ${spec.name}`);
      }
    }
    expect(wrong, 'an acceptance test must never be skipped or singled out').toEqual([]);
  });
});
