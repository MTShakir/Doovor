'use client';

import { penceAsTyped } from '@repo/core/catalogue';
import { formatPence } from '@repo/core/money';
import type { Result } from '@repo/core/result';
import { formatMinutes } from '@repo/core/time';
import { Button } from '@repo/ui/button';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { ListDivider, ListRow } from '@repo/ui/list-row';
import { Sheet } from '@repo/ui/sheet';
import { StatusPill } from '@repo/ui/status-pill';
import { Switch } from '@repo/ui/switch';
import { toast } from '@repo/ui/toast';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';
import type { PackageView } from '@/lib/catalogue/catalogue';

export interface PackagesEditorProps {
  packages: PackageView[];
  save: (input: unknown) => Promise<Result<{ packageId: string }>>;
}

function packageLine(one: PackageView): string {
  const expiry = one.expiryDays === null ? 'never runs out' : `use within ${String(one.expiryDays)} days`;
  return `${formatMinutes(one.minutes)} for ${formatPence(one.pricePence)}, ${expiry}`;
}

/** The fields for one package, new or changed (PAY-04). */
function PackageForm({ editing, save, onSaved }: { editing: PackageView | null; save: PackagesEditorProps['save']; onSaved: () => void }) {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [values, setValues] = useState({
    name: editing?.name ?? '',
    hours: editing ? String(editing.minutes / 60) : '',
    price: penceAsTyped(editing?.pricePence ?? null),
    expiryDays: editing && editing.expiryDays !== null ? String(editing.expiryDays) : '',
    onSale: editing?.onSale ?? true,
  });
  const change = (patch: Partial<typeof values>) => { setValues((current) => ({ ...current, ...patch })); };

  const onSubmit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setFormError(null);
    setErrors({});
    startTransition(async () => {
      const result = await save({ packageId: editing?.packageId ?? null, ...values });
      if (result.ok) {
        toast(editing ? 'Package saved' : 'Package added');
        onSaved();
        return;
      }
      setErrors(result.fields ?? {});
      if (!result.fields) setFormError(result.message);
    });
  };

  return (
    <ClientForm onSubmit={onSubmit} pending={pending} className="flex flex-col gap-4">
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      <Field label="Name" hint="What learners see, like 10 hours." error={errors.name}>
        <Input autoComplete="off" value={values.name} onChange={(event) => { change({ name: event.target.value }); }} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Hours" hint="In half hours." error={errors.hours}>
          <Input inputMode="decimal" autoComplete="off" value={values.hours} onChange={(event) => { change({ hours: event.target.value }); }} />
        </Field>
        <Field label="Price, £" error={errors.price}>
          <Input inputMode="decimal" autoComplete="off" value={values.price} onChange={(event) => { change({ price: event.target.value }); }} />
        </Field>
      </div>
      <Field label="Days to use the hours in" hint="Leave empty if they never run out." error={errors.expiryDays}>
        <Input inputMode="numeric" autoComplete="off" value={values.expiryDays} onChange={(event) => { change({ expiryDays: event.target.value }); }} />
      </Field>
      <Switch
        label="On sale"
        description="Off stops new sales. Hours already bought still count."
        checked={values.onSale}
        onCheckedChange={(onSale) => { change({ onSale }); }}
      />
      <SubmitButton width="full" pending={pending}>
        {editing ? 'Save package' : 'Add package'}
      </SubmitButton>
    </ClientForm>
  );
}

/** PAY-04, SCH-04: the packages of hours a Business sells, each changed in a sheet. */
export function PackagesEditor({ packages, save }: PackagesEditorProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PackageView | null>(null);
  // A new form each time the sheet opens, so it starts from the package chosen.
  const [formKey, setFormKey] = useState(0);

  const openFor = (one: PackageView | null) => {
    setEditing(one);
    setFormKey((key) => key + 1);
    setOpen(true);
  };

  return (
    <div className="flex flex-col gap-3">
      {packages.length === 0 ? (
        <p className="text-small text-grey-700">No packages yet. Learners pay lesson by lesson.</p>
      ) : (
        <ul className="-mx-4">
          {packages.map((one, index) => (
            <li key={one.packageId}>
              {index > 0 ? <ListDivider /> : null}
              <ListRow
                asChild
                title={one.name}
                subtitle={packageLine(one)}
                trailing={one.onSale ? null : <StatusPill status="cancelled">Not on sale</StatusPill>}
                chevron
              >
                <button type="button" aria-label={`${one.name}, ${packageLine(one)}${one.onSale ? '' : ', not on sale'}`} onClick={() => { openFor(one); }} />
              </ListRow>
            </li>
          ))}
        </ul>
      )}
      <div>
        <Button variant="secondary" onClick={() => { openFor(null); }}>
          <Plus className="size-5" aria-hidden />
          Add a package
        </Button>
      </div>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={editing ? editing.name : 'Add a package'}
        description="Hours learners buy ahead, used for any lesson here."
      >
        <PackageForm
          key={formKey}
          editing={editing}
          save={save}
          onSaved={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </Sheet>
    </div>
  );
}
