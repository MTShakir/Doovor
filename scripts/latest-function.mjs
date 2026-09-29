#!/usr/bin/env node
/**
 * Prints the newest definition of a Postgres function across the migrations.
 *
 * `create or replace` means the one that counts is the last one applied, and a migration that
 * re-declares a function from an older copy silently throws away everything added in between.
 * That has happened twice (D-225): once to `record_offline_payment`, which lost the fee handling
 * cancellations rely on, and once to `learner_balance`. Ask this rather than grepping.
 *
 * Usage: node scripts/latest-function.mjs public.learner_balance
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const name = process.argv[2];
if (!name) {
  console.error('Usage: node scripts/latest-function.mjs <schema.function>');
  process.exit(2);
}

const dir = path.resolve(import.meta.dirname, '..', 'supabase', 'migrations');
const files = readdirSync(dir).filter((one) => one.endsWith('.sql')).sort();
let found = null;

for (const file of files) {
  const sql = readFileSync(path.join(dir, file), 'utf8');
  const marker = `create or replace function ${name}(`;
  let at = sql.indexOf(marker);
  while (at !== -1) {
    const end = sql.indexOf('\n$$;', at);
    if (end === -1) break;
    found = { file, sql: sql.slice(at, end + '\n$$;'.length) };
    at = sql.indexOf(marker, end);
  }
}

if (!found) {
  console.error(`No definition of ${name} in ${dir}`);
  process.exit(1);
}
console.error(`# newest definition: ${found.file}`);
process.stdout.write(found.sql);
