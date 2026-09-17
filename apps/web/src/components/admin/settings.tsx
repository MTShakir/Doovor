'use client';

import { formatPence } from '@repo/core/money';
import type { Result } from '@repo/core/result';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { Switch } from '@repo/ui/switch';
import { toast } from '@repo/ui/toast';
import { useId, useState, useTransition, type ReactNode } from 'react';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';

type SaveSetting = (input: unknown) => Promise<Result<null>>;

/** ADM-05: one setting, what it does, and when it last changed. */
export function SettingCard({
  title,
  description,
  changedOn,
  children,
}: {
  title: string;
  description: string;
  changedOn: string | null;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <Card className="flex flex-col gap-4" role="region" aria-labelledby={id}>
      <div className="flex flex-col gap-1">
        <CardTitle id={id}>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        {changedOn ? <p className="text-small text-grey-700">Last changed {changedOn}</p> : null}
      </div>
      {children}
    </Card>
  );
}

/** Values as typed, saved as one, with each field's refusal beside it. */
function useSettingForm<Values extends Record<string, unknown>>(initial: Values, save: SaveSetting, done: string) {
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const change = (patch: Partial<Values>) => { setValues((current) => ({ ...current, ...patch })); };
  const submit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    startTransition(async () => {
      const result = await save(values);
      if (!result.ok) {
        setErrors(result.fields ?? {});
        if (!result.fields) setFormError(result.message);
        return;
      }
      toast(done);
    });
  };
  return { pending, values, change, errors, formError, submit };
}

function SettingForm({
  form,
  readOnly,
  label,
  children,
}: {
  form: { pending: boolean; formError: string | null; submit: (event: { preventDefault: () => void }) => void };
  readOnly: boolean;
  label: string;
  children: ReactNode;
}) {
  return (
    <ClientForm onSubmit={form.submit} pending={form.pending} className="flex flex-col gap-4">
      {form.formError ? <FormAlert>{form.formError}</FormAlert> : null}
      <fieldset disabled={readOnly} className="grid min-w-0 gap-3 md:grid-cols-2">
        {children}
      </fieldset>
      {readOnly ? null : (
        <SubmitButton variant="secondary" width="responsive" pending={form.pending}>
          {label}
        </SubmitButton>
      )}
    </ClientForm>
  );
}

/** PRD 4.2: how many instructors, and how many free hours, an area needs before it opens. */
export function SwitchOnRuleForm({ rule, save, readOnly }: { rule: { instructors: number; hours: number }; save: SaveSetting; readOnly: boolean }) {
  const form = useSettingForm({ instructors: String(rule.instructors), hours: String(rule.hours) }, save, 'Switch-on rule saved');
  return (
    <SettingForm form={form} readOnly={readOnly} label="Save the rule">
      <Field label="Verified instructors covering the area" hint="1 to 1,000." error={form.errors.instructors}>
        <Input inputMode="numeric" value={form.values.instructors} onChange={(event) => { form.change({ instructors: event.target.value }); }} />
      </Field>
      <Field label="Free hours between them" hint="In the next 14 days." error={form.errors.hours}>
        <Input inputMode="numeric" value={form.values.hours} onChange={(event) => { form.change({ hours: event.target.value }); }} />
      </Field>
    </SettingForm>
  );
}

/** PRD 9.18, NTF-01: the text message reminders each paid plan includes a month. */
export function PlanLimitsForm({ limits, save, readOnly }: { limits: { proSms: number; schoolSms: number }; save: SaveSetting; readOnly: boolean }) {
  const form = useSettingForm({ proSms: String(limits.proSms), schoolSms: String(limits.schoolSms) }, save, 'Plan limits saved');
  return (
    <SettingForm form={form} readOnly={readOnly} label="Save plan limits">
      <Field label="Pro: texts a month" hint="0 to 10,000, for each Business." error={form.errors.proSms}>
        <Input inputMode="numeric" value={form.values.proSms} onChange={(event) => { form.change({ proSms: event.target.value }); }} />
      </Field>
      <Field label="School: texts a month" hint="0 to 10,000, for each school." error={form.errors.schoolSms}>
        <Input inputMode="numeric" value={form.values.schoolSms} onChange={(event) => { form.change({ schoolSms: event.target.value }); }} />
      </Field>
    </SettingForm>
  );
}

/** PRD 9.18: the booking fee on a learner's first marketplace booking with an instructor, from Phase 3. */
export function MarketplaceFeeForm({ fee, save, readOnly }: { fee: { percent: number; capPence: number }; save: SaveSetting; readOnly: boolean }) {
  const form = useSettingForm(
    { percent: String(fee.percent), cap: formatPence(fee.capPence, { alwaysShowPence: false }).replace('£', '') },
    save,
    'Marketplace fee saved',
  );
  return (
    <SettingForm form={form} readOnly={readOnly} label="Save the fee">
      <Field label="Fee" hint="Per cent of the lesson, 0 to 20." error={form.errors.percent}>
        <Input inputMode="numeric" value={form.values.percent} onChange={(event) => { form.change({ percent: event.target.value }); }} />
      </Field>
      <Field label="Never more than" hint="Pounds, up to £20." error={form.errors.cap}>
        <Input inputMode="decimal" value={form.values.cap} onChange={(event) => { form.change({ cap: event.target.value }); }} />
      </Field>
    </SettingForm>
  );
}

/** ADM-05: the features switched on for everybody. */
export function FeatureFlagsForm({
  flags,
  save,
  readOnly,
}: {
  flags: { googleSignIn: boolean; appleSignIn: boolean; marketplace: boolean };
  save: SaveSetting;
  readOnly: boolean;
}) {
  const form = useSettingForm(flags, save, 'Features saved');
  return (
    <ClientForm onSubmit={form.submit} pending={form.pending} className="flex flex-col gap-4">
      {form.formError ? <FormAlert>{form.formError}</FormAlert> : null}
      <div className="flex flex-col">
        <Switch
          label="Sign in with Google"
          description="Shown wherever Google's keys are set up."
          checked={form.values.googleSignIn}
          disabled={readOnly}
          onCheckedChange={(googleSignIn) => { form.change({ googleSignIn }); }}
        />
        <Switch
          label="Sign in with Apple"
          description="Leave off until Apple's keys are set up."
          checked={form.values.appleSignIn}
          disabled={readOnly}
          onCheckedChange={(appleSignIn) => { form.change({ appleSignIn }); }}
        />
        <Switch
          label="Learner marketplace search"
          description="Phase 3. Areas still open one at a time on the Regions screen."
          checked={form.values.marketplace}
          disabled={readOnly}
          onCheckedChange={(marketplace) => { form.change({ marketplace }); }}
        />
      </div>
      {readOnly ? null : (
        <SubmitButton variant="secondary" width="responsive" pending={form.pending}>
          Save features
        </SubmitButton>
      )}
    </ClientForm>
  );
}
