import { formatPence } from '@repo/core/money';
import { formatDate, formatDateTime } from '@repo/core/time';
import { Button } from '@repo/ui/button';
import { SkeletonRow } from '@repo/ui/skeleton';
import { ChevronLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { myData } from '@/lib/account/export';
import { requireAccess } from '@/lib/auth/session';
import { PrintThis } from './print-this';

export const metadata: Metadata = { title: 'Your data', robots: { index: false } };

/** Nobody's own data can be prepared before they ask for it. */
export const instant = false;

export default function YourDataPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-2 pt-8" aria-busy>
          <SkeletonRow />
          <SkeletonRow />
        </div>
      }
    >
      <YourData />
    </Suspense>
  );
}

async function YourData() {
  await requireAccess();
  const data = await myData();

  return (
    <div className="flex flex-col gap-6 py-6">
      <div className="flex flex-col gap-3 print:hidden">
        <Link href="/account" className="inline-flex items-center gap-1 self-start text-small font-semibold text-blue underline underline-offset-4">
          <ChevronLeft className="size-4" aria-hidden />
          Account and security
        </Link>
        <div className="flex flex-col gap-2">
          <h1 className="text-h1 text-black">Your data</h1>
          <p className="text-body text-grey-700">
            Everything we hold about you. Print this page to keep it as a PDF, or download the same thing as a file.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <PrintThis />
          <Button variant="secondary" asChild>
            <a href="/account/data.json" download>
              Download as JSON
            </a>
          </Button>
        </div>
      </div>

      {data === null ? (
        <p className="text-body text-ink">Your data could not be gathered. Try again in a moment.</p>
      ) : (
        <div className="flex flex-col gap-8">
          <h2 className="hidden text-h2 text-black print:block">Your data</h2>
          {Object.entries(data)
            .filter(([key]) => key !== 'account_id')
            .map(([key, value]) => (
              <Section key={key} name={key} value={value} />
            ))}
        </div>
      )}
    </div>
  );
}

function Section({ name, value }: { name: string; value: unknown }) {
  return (
    <section className="flex flex-col gap-2 break-inside-avoid" aria-labelledby={`about-${name}`}>
      <h3 id={`about-${name}`} className="text-h3 text-black">
        {words(name)}
      </h3>
      <Value name={name} value={value} />
    </section>
  );
}

/** The export as it stands, read out: objects as pairs, lists as lists, dates and money as words. */
function Value({ name, value }: { name: string; value: unknown }): React.ReactNode {
  if (value === null || value === undefined) return <p className="text-body text-grey-700">Nothing held.</p>;

  if (Array.isArray(value)) {
    if (value.length === 0) return <p className="text-body text-grey-700">Nothing held.</p>;
    return (
      <ol className="flex flex-col gap-3">
        {(value as unknown[]).map((one, index) => (
          // The export is a snapshot, so position is identity.
          <li key={index} className="break-inside-avoid rounded-card border border-grey-200 p-3">
            <Value name={name} value={one} />
          </li>
        ))}
      </ol>
    );
  }

  if (typeof value === 'object') {
    return (
      <dl className="grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-1 sm:grid-cols-[12rem_minmax(0,1fr)]">
        {Object.entries(value as Record<string, unknown>).map(([key, inner]) =>
          inner === null || (Array.isArray(inner) && inner.length === 0) ? null : (
            <div key={key} className="contents">
              <dt className="text-small font-semibold text-black">{words(key)}</dt>
              <dd className="text-body text-ink">
                {typeof inner === 'object' ? <Value name={key} value={inner} /> : <span>{said(key, inner)}</span>}
              </dd>
            </div>
          ),
        )}
      </dl>
    );
  }

  return <p className="text-body text-ink">{said(name, value)}</p>;
}

/** A key as a person reads it: "marketing_consent" is "Marketing consent", "price_pence" is "Price". */
function words(key: string): string {
  const spaced = key.replace(/_pence$/, '').replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** A value as a person reads it: money in pounds, an instant as a date and time, a yes as "Yes". */
function said(key: string, value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return key.endsWith('_pence') ? formatPence(value) : String(value);
  if (typeof value !== 'string') return JSON.stringify(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(new Date(`${value}T12:00:00Z`));
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const when = new Date(value);
    return Number.isNaN(when.getTime()) ? value : formatDateTime(when);
  }
  return value;
}
