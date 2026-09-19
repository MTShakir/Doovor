// Asks for each page Lighthouse is about to measure, once, so the first run is not paying for the
// first render (NFR-PERF-04, M5-24, D-151). A visitor after the first never pays that, and a
// median of three that includes it is a median of something nobody experiences.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { pages } = require('../lighthouserc.cjs');

for (const url of pages) {
  const started = Date.now();
  const answer = await fetch(url, { headers: { 'user-agent': 'Doovor-warm-up' } });
  if (!answer.ok) {
    console.error(`${url} answered ${String(answer.status)}`);
    process.exit(1);
  }
  await answer.text();
  console.log(`warmed ${new URL(url).pathname} in ${String(Date.now() - started)} ms`);
}
