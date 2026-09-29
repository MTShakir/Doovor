'use client';

import type { Result } from '@repo/core/result';

import { Button } from '@repo/ui/button';
import { Card, CardTitle } from '@repo/ui/card';
import { ListDivider, ListRow } from '@repo/ui/list-row';
import { Sheet } from '@repo/ui/sheet';
import { StatusPill } from '@repo/ui/status-pill';
import { toast } from '@repo/ui/toast';
import { Plus } from 'lucide-react';
import { Fragment, useEffect, useId, useRef, useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import { PickupForm, type PickupDraft } from '@/components/learners/pickup-form';
import type { LearnerPickupPoint } from '@/lib/pickup/list';

/** What the card saves with: the learner's page hands in its actions, the design page stand-ins. */
export interface PickupActions {
  add: (input: { learnerId: string; pickup: PickupDraft }) => Promise<Result<null>>;
  update: (input: { learnerId: string; pickupId: string; pickup: PickupDraft }) => Promise<Result<null>>;
  remove: (input: { learnerId: string; pickupId: string }) => Promise<Result<null>>;
}

/** The postcode first, so it is what a narrow row still shows when the address runs out of room. */
function where(pickup: LearnerPickupPoint, after: string): string {
  return [pickup.postcode, after].filter((part) => part !== null && part !== '').join(' · ');
}

/**
 * Somebody's pickup points (COV-04, D-168, D-182): the ones this person may change, and the ones
 * the other side added, which stay theirs. The same card serves an instructor looking at a
 * learner's and a learner looking at their own, so it is told how to say both.
 */
export function PickupPoints({
  learnerId,
  pickups,
  actions,
  addedByOthers,
  empty,
  note,
  openAdd = false,
}: {
  learnerId: string;
  pickups: LearnerPickupPoint[];
  actions: PickupActions;
  /** What a row this person may not change says: "added by Jack Taylor", or "added by your school". */
  addedByOthers: string;
  /** What the card says with nothing saved yet, in the voice of whoever is reading it. */
  empty: string;
  /** Under the sheet's title: who else sees what is saved. */
  note: string;
  /**
   * Opens the add form as soon as the card is on screen, for somebody sent here from a lesson to
   * add a place it can be collected from (D-222).
   */
  openAdd?: boolean;
}) {
  const titleId = useId();
  const asked = useRef(false);
  const [editing, setEditing] = useState<{ id: string | null; draft: PickupDraft } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const open = (pickup: LearnerPickupPoint | null) => {
    setErrors({});
    setFormError(null);
    setEditing({
      id: pickup?.id ?? null,
      draft: pickup
        ? { kind: pickup.kind, label: pickup.label, address: pickup.address, postcode: pickup.postcode ?? '', isDefault: pickup.isDefault }
        : // The first one is where lessons start, as it would be anyway.
          { kind: 'home', label: '', address: '', postcode: '', isDefault: pickups.length === 0 },
    });
  };

  // Once, and only on the way in: reopening it every time the card redraws would trap somebody
  // who has just closed it.
  useEffect(() => {
    if (!openAdd || asked.current) return;
    asked.current = true;
    open(null);
    // `open` is rebuilt on every render and asking for it here would run this again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openAdd]);

  const change = (next: Partial<PickupDraft>) => {
    setEditing((current) => (current ? { ...current, draft: { ...current.draft, ...next } } : current));
  };

  const failed = (result: { message: string; fields?: Record<string, string> }) => {
    const { form, ...fields } = result.fields ?? {};
    setErrors(fields);
    setFormError(form ?? (result.fields ? null : result.message));
  };

  const save = () => {
    if (!editing) return;
    const { id, draft } = editing;
    setErrors({});
    setFormError(null);
    startTransition(async () => {
      const result = id
        ? await actions.update({ learnerId, pickupId: id, pickup: draft })
        : await actions.add({ learnerId, pickup: draft });
      if (!result.ok) {
        failed(result);
        return;
      }
      setEditing(null);
      toast(id ? 'Pickup point saved' : 'Pickup point added');
    });
  };

  const remove = () => {
    if (!editing?.id) return;
    const pickupId = editing.id;
    startTransition(async () => {
      const result = await actions.remove({ learnerId, pickupId });
      if (!result.ok) {
        failed(result);
        return;
      }
      setEditing(null);
      toast('Pickup point removed');
    });
  };

  return (
    <Card padding="none" role="region" aria-labelledby={titleId}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 pb-2">
        <CardTitle id={titleId}>Pickup points</CardTitle>
        <Button variant="secondary" onClick={() => { open(null); }}>
          <Plus className="size-5" aria-hidden />
          Add one
        </Button>
      </div>
      {pickups.length === 0 ? (
        <p className="px-4 pb-4 text-small text-grey-700">{empty}</p>
      ) : (
        pickups.map((pickup, index) => (
          <Fragment key={pickup.id}>
            {index === 0 ? null : <ListDivider />}
            {pickup.ours ? (
              <ListRow
                asChild
                title={pickup.label}
                subtitle={where(pickup, pickup.address)}
                trailing={pickup.isDefault ? <StatusPill status="credit">Lessons start here</StatusPill> : undefined}
                chevron
              >
                <button type="button" aria-label={`Change ${pickup.label}`} onClick={() => { open(pickup); }} />
              </ListRow>
            ) : (
              <ListRow
                title={pickup.label}
                subtitle={where(pickup, addedByOthers)}
                trailing={pickup.isDefault ? <StatusPill status="credit">Lessons start here</StatusPill> : undefined}
              />
            )}
          </Fragment>
        ))
      )}

      <Sheet
        open={editing !== null}
        onOpenChange={(isOpen) => { if (!isOpen) setEditing(null); }}
        title={editing?.id ? 'Change this pickup point' : 'Add a pickup point'}
        description={note}
        footer={
          <Button width="full" size="lg" pending={pending} onClick={save}>
            Save
          </Button>
        }
      >
        {editing ? (
          <div className="flex flex-col gap-4">
            {formError ? <FormAlert>{formError}</FormAlert> : null}
            <PickupForm draft={editing.draft} errors={errors} onChange={change} />
            {editing.id ? (
              <div className="flex flex-col gap-1 border-t border-grey-200 pt-4">
                <Button variant="tertiary" className="self-start" disabled={pending} onClick={remove}>
                  Remove it
                </Button>
                <p className="text-small text-grey-700">Lessons that start here keep no pickup point.</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </Sheet>
    </Card>
  );
}
