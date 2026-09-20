'use client';

import { Button } from '@repo/ui/button';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { EmptyState } from '@repo/ui/empty-state';
import { Field } from '@repo/ui/field';
import { Sheet } from '@repo/ui/sheet';
import { StatusPill } from '@repo/ui/status-pill';
import { Textarea } from '@repo/ui/input';
import { toast } from '@repo/ui/toast';
import { HeartHandshake, Mail, MessageSquare, Phone, UserRoundCheck } from 'lucide-react';
import { useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import type { DeletionRequest } from '@/lib/admin/deletions';
import { keepAccount } from './actions';

/** How long staff have, as a person would say it. */
function leftToAct(daysLeft: number): string {
  if (daysLeft <= 0) return 'Due to be erased';
  return daysLeft === 1 ? 'Erased tomorrow' : `${String(daysLeft)} days left`;
}

function Reach({ request }: { request: DeletionRequest }) {
  const digits = request.phone?.replace(/\D/g, '') ?? '';
  return (
    <div className="flex flex-wrap gap-2">
      {request.email === null ? null : (
        <Button asChild variant="secondary">
          <a href={`mailto:${request.email}`}>
            <Mail className="size-5" aria-hidden />
            Email
          </a>
        </Button>
      )}
      {request.phone === null ? null : (
        <>
          <Button asChild variant="secondary">
            <a href={`tel:${request.phone}`}>
              <Phone className="size-5" aria-hidden />
              Call
            </a>
          </Button>
          <Button asChild variant="secondary">
            <a href={`https://wa.me/${digits}`} target="_blank" rel="noreferrer">
              <MessageSquare className="size-5" aria-hidden />
              WhatsApp
            </a>
          </Button>
        </>
      )}
    </div>
  );
}

/**
 * Who has asked to leave (AUTH-09, ADM-02, D-175): why they are going, how to reach them, and how
 * long before the account is erased. A super admin who has put it right calls the request off; the
 * person is told nothing by this screen, because the conversation happens outside it.
 */
export function DeletionsScreen({ requests, canKeep }: { requests: DeletionRequest[]; canKeep: boolean }) {
  const [keeping, setKeeping] = useState<DeletionRequest | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const open = (request: DeletionRequest) => {
    setError(null);
    setNote('');
    setKeeping(request);
  };

  const keep = () => {
    if (!keeping) return;
    setError(null);
    startTransition(async () => {
      const result = await keepAccount({ requestId: keeping.id, note });
      if (!result.ok) {
        setError(result.fields?.note ?? result.message);
        return;
      }
      const name = keeping.name;
      setKeeping(null);
      toast(`${name} is staying`);
    });
  };

  if (requests.length === 0) {
    return (
      <Card padding="none">
        <EmptyState
          icon={HeartHandshake}
          title="Nobody is leaving"
          description="When somebody asks to delete their account, they appear here with what they said and how to reach them."
        />
      </Card>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-4">
        {requests.map((request) => (
          <li key={request.id}>
            <Card className="flex flex-col gap-4" role="region" aria-labelledby={`leaving-${request.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <CardTitle id={`leaving-${request.id}`}>{request.name}</CardTitle>
                  <CardDescription>
                    {[request.role === null ? null : request.role === 'school' ? 'School' : `A ${request.role}`, request.business]
                      .filter((part) => part !== null)
                      .join(', ') || 'On the platform'}
                  </CardDescription>
                </div>
                <StatusPill status={request.daysLeft <= 1 ? 'unpaid' : 'pending'}>{leftToAct(request.daysLeft)}</StatusPill>
              </div>

              <div className="flex flex-col gap-1">
                <h3 className="text-small font-semibold text-ink">Why they are going</h3>
                <p className="text-body text-ink">{request.reason ?? 'They did not say.'}</p>
                <p className="text-small text-grey-700">
                  Asked {request.asked}. Erased {request.erases} unless it is called off.
                </p>
              </div>

              <Reach request={request} />

              {canKeep ? (
                <div className="flex flex-col gap-1 border-t border-grey-200 pt-4">
                  <Button variant="secondary" className="self-start" onClick={() => { open(request); }}>
                    <UserRoundCheck className="size-5" aria-hidden />
                    They are staying
                  </Button>
                  <p className="text-small text-grey-700">Calls the request off, so nothing is erased. Tell them first.</p>
                </div>
              ) : null}
            </Card>
          </li>
        ))}
      </ul>

      <Sheet
        open={keeping !== null}
        onOpenChange={(isOpen) => { if (!isOpen) setKeeping(null); }}
        title={keeping ? `Keep ${keeping.name}?` : 'Keep the account'}
        description="Their account stays as it is, and nothing is erased."
        footer={
          <Button width="full" size="lg" pending={pending} onClick={keep}>
            Call the deletion off
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          {error ? <FormAlert>{error}</FormAlert> : null}
          <Field label="What was sorted out?" hint="Kept with the entry in the audit log, so the next person knows.">
            <Textarea value={note} onChange={(event) => { setNote(event.target.value); }} maxLength={500} />
          </Field>
        </div>
      </Sheet>
    </>
  );
}
