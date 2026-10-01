'use client';

import { feedbackKindLabels } from '@repo/core/schemas/feedback';
import { Button } from '@repo/ui/button';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { EmptyState } from '@repo/ui/empty-state';
import { StatusPill } from '@repo/ui/status-pill';
import { toast } from '@repo/ui/toast';
import { Check, Mail, MessageSquare, Undo2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import type { FeedbackReport } from '@/lib/admin/feedback';
import { handleFeedback } from './actions';

/** What sort of thing it is, what they were working in, and how to reach them. */
function Whose({ report }: { report: FeedbackReport }) {
  const parts = [feedbackKindLabels[report.kind], report.business, report.businessKind, report.personEmail].filter(
    (part) => part !== null,
  );
  return <CardDescription>{parts.join(' · ')}</CardDescription>;
}

function Report({ report }: { report: FeedbackReport }) {
  const [handled, setHandled] = useState(report.handled);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const mark = (next: boolean) => {
    setError(null);
    startTransition(async () => {
      const result = await handleFeedback({ feedbackId: report.id, handled: next });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setHandled(next);
      toast(next ? 'Marked as dealt with' : 'Put back');
    });
  };

  return (
    <Card className="flex flex-col gap-4" role="region" aria-labelledby={`report-${report.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <CardTitle id={`report-${report.id}`}>
            {/* The reference first: it is what somebody writing in about this will quote, so it is
                what staff need to find them by (D-241). */}
            <span className="text-grey-700">{report.reference}</span> {report.person}
          </CardTitle>
          <Whose report={report} />
        </div>
        <StatusPill status={handled ? 'completed' : report.kind === 'issue' ? 'unpaid' : 'attention'}>
          {handled ? 'Dealt with' : 'Waiting'}
        </StatusPill>
      </div>

      <p className="text-body whitespace-pre-line text-ink">{report.message}</p>

      {report.images.length === 0 ? null : (
        <ul className="flex flex-wrap gap-2" aria-label="Pictures they attached">
          {report.images.map((url, index) => (
            <li key={url}>
              <a href={url} target="_blank" rel="noreferrer" className="block rounded-card focus-visible:outline-2">
                {/* A signed address that expires, for something private: the image
                    optimiser would cache a copy of it and keep it past that. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`Attachment ${String(index + 1)} from ${report.person}`}
                  className="size-32 rounded-card border border-grey-200 object-cover"
                />
              </a>
            </li>
          ))}
        </ul>
      )}

      <p className="text-small text-grey-700">
        Sent {report.sent}
        {report.page === null ? '' : ` from ${report.page}`}
      </p>

      {error ? <FormAlert>{error}</FormAlert> : null}

      <div className="flex flex-wrap gap-2 border-t border-grey-200 pt-4">
        {handled ? (
          <Button variant="tertiary" pending={pending} onClick={() => { mark(false); }}>
            <Undo2 className="size-5" aria-hidden />
            Put it back
          </Button>
        ) : (
          <Button variant="secondary" pending={pending} onClick={() => { mark(true); }}>
            <Check className="size-5" aria-hidden />
            Dealt with
          </Button>
        )}
        {report.personEmail === null ? null : (
          <Button asChild variant="tertiary">
            <a href={`mailto:${report.personEmail}?subject=${encodeURIComponent(`${report.reference}: about what you told us`)}`}>
              <Mail className="size-5" aria-hidden />
              Reply
            </a>
          </Button>
        )}
      </div>
    </Card>
  );
}

/**
 * What people have told us (D-202): a request, a problem, or anything else, newest first, with who
 * sent it and which screen they were on. Staff mark one dealt with so the next person knows.
 */
export function FeedbackScreen({ reports }: { reports: FeedbackReport[] }) {
  if (reports.length === 0) {
    return (
      <Card padding="none">
        <EmptyState
          icon={MessageSquare}
          title="Nothing here"
          description="When somebody tells us something, it appears here with who sent it and what they were looking at."
        />
      </Card>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {reports.map((report) => (
        <li key={report.id}>
          <Report report={report} />
        </li>
      ))}
    </ul>
  );
}
