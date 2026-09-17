// The Lighthouse scores of the last `lhci collect`, as a table: the median of each page's runs for each
// category, and its median Largest Contentful Paint (NFR-PERF-01, NFR-PERF-04, M5-24). Written to the
// CI job's summary when there is one, so the scores can be read from the run.
import { appendFileSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const dir = path.resolve(import.meta.dirname, '..', '.lighthouseci');
const categories = [
  ['performance', 'Performance'],
  ['accessibility', 'Accessibility'],
  ['best-practices', 'Best practices'],
  ['seo', 'SEO'],
];

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const runs = new Map();
for (const file of readdirSync(dir).filter((name) => /^lhr-.*\.json$/.test(name))) {
  const report = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
  const page = new URL(report.requestedUrl).pathname;
  runs.set(page, [...(runs.get(page) ?? []), report]);
}
if (runs.size === 0) {
  console.error(`No Lighthouse reports in ${dir}. Run lhci collect first.`);
  process.exit(1);
}

const lines = [
  `| Page | ${categories.map(([, label]) => label).join(' | ')} | LCP | Runs |`,
  `|---|${categories.map(() => '---:').join('|')}|---:|---:|`,
];
for (const [page, reports] of [...runs.entries()].sort()) {
  const scores = categories.map(([key]) => Math.round(median(reports.map((report) => report.categories[key].score)) * 100));
  const lcp = median(reports.map((report) => report.audits['largest-contentful-paint'].numericValue)) / 1000;
  lines.push(`| \`${page}\` | ${scores.join(' | ')} | ${lcp.toFixed(1)} s | ${String(reports.length)} |`);
}

// Each run, for when a page's runs disagree: what moved, and how fast the machine measured itself.
lines.push(
  '',
  '| Page | Run | Performance | FCP | LCP | TBT | CLS | Speed index | Server response | CPU benchmark |',
  '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
);
for (const [page, reports] of [...runs.entries()].sort()) {
  reports.forEach((report, index) => {
    const shown = (id) => report.audits[id].displayValue;
    const cells = [
      `\`${page}\``,
      String(index + 1),
      String(Math.round(report.categories.performance.score * 100)),
      shown('first-contentful-paint'),
      shown('largest-contentful-paint'),
      shown('total-blocking-time'),
      shown('cumulative-layout-shift'),
      shown('speed-index'),
      `${String(Math.round(report.audits['server-response-time'].numericValue))} ms`,
      String(Math.round(report.environment.benchmarkIndex)),
    ];
    lines.push(`| ${cells.join(' | ')} |`);
  });
}

const table = `${lines.join('\n')}\n`;
process.stdout.write(table);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Lighthouse, public pages (NFR-PERF-04)\n\n${table}\n`);
}
