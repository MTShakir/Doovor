import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = path.resolve(import.meta.dirname, '../..');
const maps = path.join(source, 'components', 'map');

/** Every module allowed to touch the library, and the one container that pulls each in lazily. */
const lazy = [
  { module: path.join(maps, 'mapbox-map.tsx'), container: path.join(maps, 'radius-map.tsx'), name: './mapbox-map' },
  { module: path.join(maps, 'pickup-mapbox.tsx'), container: path.join(maps, 'pickup-map.tsx'), name: './pickup-mapbox' },
];

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
 * page downloads. Bundling guarantees that only while every module that imports the library is
 * reached through `next/dynamic` and nothing else imports it, which is what this checks.
 */
describe('the map library stays out of the shared bundle (COV-01, M1-06)', () => {
  // Every file, read once. Walking the tree again for each lazy module made this the slowest
  // test in the suite, and slow enough under a whole run to time out (D-192).
  const files = everyFile(source).map((path) => ({ path, text: readFileSync(path, 'utf8') }));

  it('is imported by the lazy modules only', () => {
    const importers = files.filter((file) => file.text.includes("from 'mapbox-gl")).map((file) => file.path);

    expect(importers.sort()).toEqual(lazy.map((one) => one.module).sort());
  });

  it('and each of those is only ever reached through next/dynamic', () => {
    for (const { module, container, name } of lazy) {
      const imports = new RegExp(`^import .*from '.*${name.slice(1)}'`, 'm');
      const statics = files.filter((file) => file.path !== module && imports.test(file.text)).map((file) => file.path);

      expect(statics).toEqual([]);
      expect(readFileSync(container, 'utf8')).toMatch(new RegExp(`dynamic\\(\\(\\) => import\\('${name}'\\), \\{\\s*ssr: false`));
    }
  });
});
