'use client';

import type { IntendedRole } from '@repo/core/schemas/auth';
import { Button } from '@repo/ui/button';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import { RoleCards } from '@/components/role-cards';
import { chooseRole } from '../actions';

function roleFromParam(value: string | null): IntendedRole | null {
  return value === 'learner' || value === 'instructor' || value === 'school' ? value : null;
}

/** For people signed in without a role yet, for example after Google sign-in. */
export function SignedInRoleChoice() {
  const params = useSearchParams();
  const [role, setRole] = useState<IntendedRole | null>(roleFromParam(params.get('role')));
  const [schoolName, setSchoolName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [schoolNameError, setSchoolNameError] = useState<string | undefined>(undefined);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    setSchoolNameError(undefined);
    if (!role) {
      setError('Choose one option to carry on.');
      return;
    }
    startTransition(async () => {
      const result = await chooseRole({ role, schoolName: role === 'school' ? schoolName : undefined });
      if (!result.ok) {
        setSchoolNameError(result.fields?.schoolName);
        if (!result.fields?.schoolName) setError(result.message);
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <RoleCards value={role} onChange={setRole} />
      {role === 'school' ? (
        <Field label="School name" error={schoolNameError}>
          <Input value={schoolName} onChange={(e) => { setSchoolName(e.target.value); }} autoComplete="organization" />
        </Field>
      ) : null}
      <Button width="full" size="lg" pending={pending} onClick={submit}>
        Continue
      </Button>
    </div>
  );
}
