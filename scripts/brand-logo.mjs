#!/usr/bin/env node
// Writes the logo's shapes into packages/config/src/logo from the masters in assets/brand
// (D-244, D-249). Run `pnpm brand:logo` after replacing a file there; the test beside the
// output fails until it has been run. Every file is read and checked before anything is
// written, so an export that breaks a rule changes nothing.
import { readFileSync, writeFileSync } from 'node:fs';
import { logoArtFromSvg, sameArtwork } from '../packages/config/src/logo/art.ts';
import { logoMasters } from '../packages/config/src/logo/masters.ts';

const root = new URL('../', import.meta.url);

function read(file) {
  try {
    return logoArtFromSvg(readFileSync(new URL(`assets/brand/${file}`, root), 'utf8'));
  } catch (error) {
    throw new Error(`assets/brand/${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const problems = [];
const made = [];
for (const master of logoMasters) {
  try {
    const art = read(master.file);
    if (master.whiteFile !== undefined && !sameArtwork(read(master.whiteFile), art)) {
      throw new Error(`assets/brand/${master.whiteFile} is not the same artwork as ${master.file}; export both from the same file`);
    }
    made.push({ master, art });
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }
}
if (problems.length > 0) {
  console.error(`Nothing written. ${problems.join('\n')}`);
  process.exit(1);
}

for (const { master, art } of made) {
  const paths = art.paths.map((path) => `    { d: '${path.d}', evenOdd: ${String(path.evenOdd)} },`).join('\n');
  const source = `// Made by \`pnpm brand:logo\` from assets/brand/${master.file}. Change the file there, not this one.
import type { LogoArt } from './art.ts';

/** ${master.description} */
export const ${master.name}: LogoArt = {
  width: ${String(art.width)},
  height: ${String(art.height)},${art.backdrop === undefined ? '' : `\n  backdrop: '${art.backdrop}',`}
  paths: [
${paths}
  ],
};
`;
  writeFileSync(new URL(`packages/config/src/logo/${master.module}.ts`, root), source);
  console.log(`${master.module}.ts from ${master.file}: ${String(art.paths.length)} shapes, ${String(art.width)} x ${String(art.height)}`);
}
