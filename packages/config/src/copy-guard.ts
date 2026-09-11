/**
 * Copy guard (CLAUDE.md rules 8 and 9). Finds brand values outside brand.ts and em or en
 * dashes in source files. Run over the repository by scripts/check-copy.mjs in `pnpm lint`.
 */
import { brand, type Brand } from './brand.ts';

export type GuardRule = 'brand' | 'dash';

export interface Violation {
  path: string;
  line: number;
  column: number;
  rule: GuardRule;
  detail: string;
}

interface Needle {
  label: string;
  pattern: RegExp;
}

/** The only file allowed to contain brand values. */
export const BRAND_SOURCE = 'packages/config/src/brand.ts';

const SCOPED_DIRS = ['apps/', 'packages/', 'supabase/', 'e2e/'];
const TEXT_EXTENSIONS = /\.(?:ts|tsx|js|jsx|mjs|cjs|json|css|sql|toml|html|svg|txt|md|mdx|yml|yaml)$/i;
/** Developer and agent instructions, not product copy (Next.js writes AGENTS.md itself). */
const DOC_FILES = new Set(['AGENTS.md', 'CLAUDE.md', 'README.md']);
// Built from char codes so this file never contains the characters it bans.
const DASH_PATTERN = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`, 'g');

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function brandNeedles(source: Brand = brand): Needle[] {
  return [
    { label: 'brand name', pattern: new RegExp(escapeRegExp(source.name), 'gi') },
    { label: 'brand domain', pattern: new RegExp(escapeRegExp(source.domain), 'gi') },
    ...Object.entries(source.colours).map(([token, hex]) => ({
      label: `brand colour ${token}`,
      pattern: new RegExp(`${escapeRegExp(hex)}(?![0-9a-f])`, 'gi'),
    })),
  ];
}

/** Paths are repository-relative with forward slashes. */
export function isInScope(path: string): boolean {
  const normalised = path.replace(/\\/g, '/');
  const basename = normalised.slice(normalised.lastIndexOf('/') + 1);
  return (
    SCOPED_DIRS.some((dir) => normalised.startsWith(dir)) &&
    TEXT_EXTENSIONS.test(normalised) &&
    !normalised.includes('/node_modules/') &&
    !DOC_FILES.has(basename)
  );
}

function scan(path: string, content: string, rule: GuardRule, needles: Needle[]): Violation[] {
  const found: Violation[] = [];
  const lines = content.split(/\r?\n/);
  lines.forEach((text, index) => {
    for (const needle of needles) {
      needle.pattern.lastIndex = 0;
      for (const match of text.matchAll(needle.pattern)) {
        found.push({ path, line: index + 1, column: match.index + 1, rule, detail: needle.label });
      }
    }
  });
  return found;
}

export function findViolations(path: string, content: string, needles = brandNeedles()): Violation[] {
  const normalised = path.replace(/\\/g, '/');
  const dashes = scan(normalised, content, 'dash', [{ label: 'em or en dash', pattern: DASH_PATTERN }]);
  if (normalised === BRAND_SOURCE) return dashes;
  return [...dashes, ...scan(normalised, content, 'brand', needles)];
}

export function formatViolation(v: Violation): string {
  const why = v.rule === 'dash' ? 'use a comma, colon or full stop instead' : `import it from ${BRAND_SOURCE}`;
  return `${v.path}:${v.line}:${v.column}  ${v.detail} (${why})`;
}
