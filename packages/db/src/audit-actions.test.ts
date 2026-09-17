import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { auditActionWords } from '@repo/core/audit';
import { describe, expect, it } from 'vitest';

const migrations = path.join(import.meta.dirname, '..', '..', '..', 'supabase', 'migrations');

/** Every action a migration records in the audit log: the first argument to each write_audit. */
function recordedActions(): Set<string> {
  const actions = new Set<string>();
  for (const file of readdirSync(migrations).filter((name) => name.endsWith('.sql'))) {
    const sql = readFileSync(path.join(migrations, file), 'utf8');
    for (const call of sql.matchAll(/write_audit\(([\s\S]*?)\);/g)) {
      // A literal, or a case choosing between literals.
      const first = /^\s*('[a-z_]+(?:\.[a-z_]+)+'|case[\s\S]*?end)/.exec(call[1] ?? '');
      for (const literal of (first?.[1] ?? '').matchAll(/'([a-z_]+(?:\.[a-z_]+)+)'/g)) {
        if (literal[1]) actions.add(literal[1]);
      }
    }
  }
  return actions;
}

describe('the audit log viewer knows every action the database records (ADM-07, M5-22)', () => {
  it('has words for each one, so none shows up in the viewer as a code', () => {
    const recorded = recordedActions();
    expect(recorded.size).toBeGreaterThan(60);
    expect([...recorded].filter((action) => !(action in auditActionWords))).toEqual([]);
  });
});
