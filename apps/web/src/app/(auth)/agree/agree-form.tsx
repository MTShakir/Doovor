'use client';

import type { LegalDocument } from '@repo/core/legal';
import { Button } from '@repo/ui/button';
import { useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import { TermsAgreement } from '@/components/terms-agreement';
import { agreeToTerms } from '../actions';

/** The tick and the button, on the screen that asks somebody to agree before they carry on (D-265). */
export function AgreeForm({ terms, next }: { terms: readonly LegalDocument[]; next: string }) {
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [failed, setFailed] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const agree = () => {
    setFailed(null);
    if (!agreed) {
      setError('Agree to the terms to carry on');
      return;
    }
    startTransition(async () => {
      // Agreeing redirects, so this resolves only when something went wrong.
      const result = await agreeToTerms({ agreed: true, next });
      if (!result.ok) setFailed(result.message);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {failed ? <FormAlert>{failed}</FormAlert> : null}
      <TermsAgreement
        terms={terms}
        checked={agreed}
        onCheckedChange={(value) => {
          setAgreed(value);
          if (value) setError(undefined);
        }}
        error={error}
      />
      <Button width="full" size="lg" pending={pending} onClick={agree}>
        Agree and continue
      </Button>
    </div>
  );
}
