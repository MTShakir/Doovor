import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = path.resolve(import.meta.dirname, '../..');
const lazyModule = path.join(source, 'components', 'map', 'mapbox-map.tsx');

function everyFile(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) return everyFile(full);
    // Tests are not bundled, and this one names the library it is guarding.
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
  });
}

/**
 * The definition of done for M1-06: the map library lazy-loads and is not in the bundle every
 * page downloads. Bundling guarantees that only while `mapbox-map.tsx` is reached through
 * `next/dynamic` and nothing else imports the library, which is what this checks.
 */
describe('the map library stays out of the shared bundle (COV-01, M1-06)', () => {
  it('is imported by one module only', () => {
    const importers = everyFile(source).filter((file) => readFileSync(file, 'utf8').includes("from 'mapbox-gl"));

    expect(importers).toEqual([lazyModule]);
  });

  it('and that module is only ever reached through next/dynamic', () => {
    const statics = everyFile(source).filter(
      (file) => file !== lazyModule && /^import .*from '.*mapbox-map'/m.test(readFileSync(file, 'utf8')),
    );
    const container = readFileSync(path.join(source, 'components', 'map', 'radius-map.tsx'), 'utf8');

    expect(statics).toEqual([]);
    expect(container).toMatch(/dynamic\(\(\) => import\('\.\/mapbox-map'\), \{\s*ssr: false/);
  });
});
