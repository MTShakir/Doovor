'use client';

import {
  guessColumns,
  importFields,
  looksLikeHeader,
  parseCsv,
  readRows,
  reviewRows,
  type ColumnMapping,
  type ImportCandidate,
  type ImportField,
  type ImportProblem,
} from '@repo/core/csv';
import { manualLearnerSchema } from '@repo/core/schemas/learner';
import { Button } from '@repo/ui/button';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { ProgressBar } from '@repo/ui/progress';
import { Select } from '@repo/ui/select';
import { CheckCircle2, Upload } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import { importLearners } from '../actions';

const labels: Record<ImportField, string> = {
  fullName: 'Name',
  phone: 'Mobile number',
  email: 'Email',
  postcode: 'Postcode',
};

/** One batch at a time, so a long file reports as it goes rather than sitting there. */
const BATCH = 20;
const MOST_ROWS = 500;

interface FileRead {
  name: string;
  rows: string[][];
  hasHeader: boolean;
  mapping: ColumnMapping;
}

/** What a row has to pass before it is sent, in the same words the form would use. */
function problemWith(candidate: ImportCandidate): string | null {
  const result = manualLearnerSchema.safeParse({
    fullName: candidate.fullName,
    phone: candidate.phone,
    email: candidate.email,
    postcode: candidate.postcode,
    transmission: '',
  });
  return result.success ? null : (result.error.issues[0]?.message ?? 'We could not read that row');
}

export function ImportLearners() {
  const [file, setFile] = useState<FileRead | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<{ imported: number; problems: ImportProblem[] } | null>(null);
  const [progress, setProgress] = useState(0);

  const onFile = (chosen: File | undefined) => {
    setError(null);
    setDone(null);
    if (!chosen) return;
    void chosen.text().then(
      (text) => {
        const rows = parseCsv(text);
        if (rows.length === 0) {
          setError('That file has no rows in it.');
          return;
        }
        if (rows.length > MOST_ROWS + 1) {
          setError(`That file has more than ${String(MOST_ROWS)} rows. Split it and import each part.`);
          return;
        }
        const first = rows[0] ?? [];
        const hasHeader = looksLikeHeader(first);
        setFile({ name: chosen.name, rows, hasHeader, mapping: guessColumns(hasHeader ? first : []) });
      },
      () => { setError('We could not read that file.'); },
    );
  };

  const candidates = file ? readRows(file.rows, file.mapping, file.hasHeader) : [];
  const review = reviewRows(candidates, problemWith);

  const start = () => {
    if (!file) return;
    setDone(null);
    setProgress(0);
    startTransition(async () => {
      const problems = [...review.problems];
      let imported = 0;

      for (let at = 0; at < review.ready.length; at += BATCH) {
        const batch = review.ready.slice(at, at + BATCH);
        const result = await importLearners({ rows: batch });
        if (!result.ok) {
          setError(result.message);
          break;
        }
        imported += result.data.imported;
        problems.push(...result.data.problems);
        setProgress(Math.min(at + BATCH, review.ready.length));
      }

      problems.sort((a, b) => a.line - b.line);
      setDone({ imported, problems });
      setFile(null);
    });
  };

  if (done) {
    return (
      <Card className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="size-6 shrink-0 text-black" aria-hidden />
          <CardTitle>
            {done.imported === 1 ? '1 learner imported' : `${String(done.imported)} learners imported`}
          </CardTitle>
        </div>
        {done.problems.length === 0 ? (
          <CardDescription>Every row went in.</CardDescription>
        ) : (
          <div className="flex flex-col gap-2">
            <CardDescription>
              {done.problems.length === 1 ? '1 row was left out:' : `${String(done.problems.length)} rows were left out:`}
            </CardDescription>
            <ul className="flex flex-col gap-1">
              {done.problems.map((problem) => (
                <li key={problem.line} className="text-small text-ink">
                  <span className="font-semibold">Line {problem.line}</span>
                  {problem.name === '' ? '' : ` (${problem.name})`}: {problem.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/app/instructor/learners">See your learners</Link>
          </Button>
          <Button variant="secondary" onClick={() => { setDone(null); }}>
            Import another file
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? <FormAlert>{error}</FormAlert> : null}

      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <CardTitle>Choose your file</CardTitle>
          <CardDescription>
            A CSV with a column for their name and one for their mobile number or email. Most apps and spreadsheets
            can save one.
          </CardDescription>
        </div>
        <Field label="Spreadsheet" hideLabel>
          <Input
            type="file"
            accept=".csv,text/csv"
            className="h-auto py-3 file:mr-3 file:rounded-full file:border-0 file:bg-black file:px-4 file:py-2 file:text-small file:font-semibold file:text-white"
            onChange={(event) => { onFile(event.target.files?.[0]); }}
          />
        </Field>
      </Card>

      {file ? (
        <>
          <Card className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <CardTitle>Which column is which?</CardTitle>
              <CardDescription>
                {file.name} has {file.rows.length} {file.rows.length === 1 ? 'row' : 'rows'}
                {file.hasHeader ? ', with a header at the top' : ''}.
              </CardDescription>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
              {importFields.map((field) => (
                <Field key={field} label={labels[field]}>
                  <Select
                    options={[
                      { value: '', label: 'Not in the file' },
                      ...(file.rows[0] ?? []).map((cell, index) => ({
                        value: String(index),
                        label: file.hasHeader && cell !== '' ? cell : `Column ${String(index + 1)}`,
                      })),
                    ]}
                    value={file.mapping[field] === null ? '' : String(file.mapping[field])}
                    onChange={(event) => {
                      const value = event.target.value;
                      setFile((current) =>
                        current === null
                          ? current
                          : { ...current, mapping: { ...current.mapping, [field]: value === '' ? null : Number(value) } },
                      );
                    }}
                  />
                </Field>
              ))}
            </div>
          </Card>

          <Card padding="none" className="flex flex-col gap-3 py-4">
            <div className="flex flex-col gap-1 px-4">
              <CardTitle>What will be imported</CardTitle>
              <CardDescription>
                {review.ready.length === 1 ? '1 learner is ready' : `${String(review.ready.length)} learners are ready`}
                {review.problems.length === 0
                  ? '.'
                  : `, and ${String(review.problems.length)} ${review.problems.length === 1 ? 'row needs' : 'rows need'} a look.`}
              </CardDescription>
            </div>
            {/* Wide on a phone, so it scrolls sideways, and a scrollable thing has to be
                reachable by keyboard as well as by thumb (axe: scrollable-region-focusable). */}
            {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- that is the fix axe asks for */}
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="The first rows of the file">
              <table className="w-full min-w-xl text-left text-small">
                <thead className="text-grey-700">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-medium">Line</th>
                    {importFields.map((field) => (
                      <th key={field} scope="col" className="px-4 py-2 font-medium">{labels[field]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {review.ready.slice(0, 5).map((row) => (
                    <tr key={row.line} className="border-t border-grey-200 text-ink">
                      <td className="px-4 py-2 tabular-nums">{row.line}</td>
                      <td className="px-4 py-2">{row.fullName}</td>
                      <td className="px-4 py-2 tabular-nums">{row.phone}</td>
                      <td className="px-4 py-2">{row.email}</td>
                      <td className="px-4 py-2">{row.postcode}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {review.problems.length > 0 ? (
              <ul className="flex flex-col gap-1 px-4">
                {review.problems.slice(0, 5).map((problem) => (
                  <li key={problem.line} className="text-small text-ink">
                    <span className="font-semibold">Line {problem.line}</span>
                    {problem.name === '' ? '' : ` (${problem.name})`}: {problem.reason}
                  </li>
                ))}
                {review.problems.length > 5 ? (
                  <li className="text-small text-grey-700">
                    and {review.problems.length - 5} more, all listed after the import
                  </li>
                ) : null}
              </ul>
            ) : null}
          </Card>

          {pending ? (
            <div className="flex flex-col gap-2">
              <ProgressBar
                value={review.ready.length === 0 ? 0 : (progress / review.ready.length) * 100}
                label={`Importing ${String(progress)} of ${String(review.ready.length)}`}
              />
              <p className="text-small text-grey-700" aria-live="polite">
                {progress} of {review.ready.length} imported
              </p>
            </div>
          ) : null}

          <Button
            width="responsive"
            size="lg"
            pending={pending}
            disabled={review.ready.length === 0}
            onClick={start}
          >
            <Upload className="size-5" aria-hidden />
            {review.ready.length === 1 ? 'Import 1 learner' : `Import ${String(review.ready.length)} learners`}
          </Button>
        </>
      ) : null}
    </div>
  );
}
