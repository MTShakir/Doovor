'use client';

import { pickupKinds, type PickupKind } from '@repo/core/schemas/pickup';
import { Button } from '@repo/ui/button';
import { Card, CardTitle } from '@repo/ui/card';
import { Checkbox } from '@repo/ui/checkbox';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { ListDivider, ListRow } from '@repo/ui/list-row';
import { Select } from '@repo/ui/select';
import { Sheet } from '@repo/ui/sheet';
import { StatusPill } from '@repo/ui/status-pill';
import { toast } from '@repo/ui/toast';
import { Plus } from 'lucide-react';
import { Fragment, useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import type { LearnerPickupPoint } from '@/lib/pickup/list';
import { addLearnerPickup, removeLearnerPickup, updateLearnerPickup } from './actions';

interface Draft {
  kind: PickupKind;
  label: string;
  address: string;
  postcode: string;
  isDefault: boolean;
}

/** The postcode first, so it is what a narrow row still shows when the address runs out of room. */
function where(pickup: LearnerPickupPoint, after: string): string {
  return [pickup.postcode, after].filter((part) => part !== null && part !== '').join(' · ');
}

/**
 * A learner's pickup points on their card (COV-04, D-168): the ones the Business added, to add,
 * correct, remove and make the one lessons start from, and the learner's own, which stay theirs.
 */
export function PickupPoints({
  learnerId,
  learnerName,
  pickups,
}: {
  learnerId: string;
  learnerName: string;
  pickups: LearnerPickupPoint[];
}) {
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
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

  const change = (next: Partial<Draft>) => {
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
        ? await updateLearnerPickup({ learnerId, pickupId: id, pickup: draft })
        : await addLearnerPickup({ learnerId, pickup: draft });
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
      const result = await removeLearnerPickup({ learnerId, pickupId });
      if (!result.ok) {
        failed(result);
        return;
      }
      setEditing(null);
      toast('Pickup point removed');
    });
  };

  return (
    <Card padding="none" role="region" aria-labelledby="pickups-title">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 pb-2">
        <CardTitle id="pickups-title">Pickup points</CardTitle>
        <Button variant="secondary" onClick={() => { open(null); }}>
          <Plus className="size-5" aria-hidden />
          Add one
        </Button>
      </div>
      {pickups.length === 0 ? (
        <p className="px-4 pb-4 text-small text-grey-700">
          None saved yet. Add where their lessons start, or they can add their own.
        </p>
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
                subtitle={where(pickup, `added by ${learnerName}`)}
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
        description={`For ${learnerName}. They see it too.`}
        footer={
          <Button width="full" size="lg" pending={pending} onClick={save}>
            Save
          </Button>
        }
      >
        {editing ? (
          <div className="flex flex-col gap-4">
            {formError ? <FormAlert>{formError}</FormAlert> : null}
            <Field label="What kind of place?" error={errors.kind}>
              <Select
                options={[...pickupKinds]}
                value={editing.draft.kind}
                onChange={(event) => { change({ kind: event.target.value as PickupKind }); }}
              />
            </Field>
            <Field
              label="What to call it"
              hint={`Optional. Left empty, it is called ${pickupKinds.find((kind) => kind.value === editing.draft.kind)?.label ?? 'by its kind'}.`}
              error={errors.label}
            >
              <Input value={editing.draft.label} onChange={(event) => { change({ label: event.target.value }); }} />
            </Field>
            <Field label="Address" error={errors.address}>
              <Input autoComplete="off" value={editing.draft.address} onChange={(event) => { change({ address: event.target.value }); }} />
            </Field>
            <Field label="Postcode" error={errors.postcode}>
              <Input
                autoCapitalize="characters"
                spellCheck={false}
                className="uppercase"
                value={editing.draft.postcode}
                onChange={(event) => { change({ postcode: event.target.value }); }}
              />
            </Field>
            <Checkbox
              label="Lessons start here"
              description="New lessons use it, unless you choose another."
              checked={editing.draft.isDefault}
              onCheckedChange={(checked) => { change({ isDefault: checked === true }); }}
            />
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
