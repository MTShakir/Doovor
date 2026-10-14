'use client';

import { legalDocuments, type LegalDocument } from '@repo/core/legal';
import { Checkbox } from '@repo/ui/checkbox';
import { Fragment } from 'react';

const linkClass = 'font-semibold text-black underline underline-offset-4';

/** A document named as a link, opening beside the form so nothing typed into it is lost. */
function DocumentLink({ document }: { document: LegalDocument }) {
  return (
    <a href={document.path} target="_blank" rel="noopener noreferrer" className={linkClass}>
      {document.title}
    </a>
  );
}

/**
 * The tick that agrees to the terms and the privacy notice (NFR-PRV-02, D-265): never ticked for
 * anybody, named with the terms that apply to them, and linked to each document.
 */
export function TermsAgreement({
  terms,
  checked,
  onCheckedChange,
  error,
}: {
  /** The terms that apply: a learner's, the business terms, or both for somebody who is both. */
  terms: readonly LegalDocument[];
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  error?: string;
}) {
  return (
    <div className="flex flex-col">
      <Checkbox
        label={
          <>
            I agree to the{' '}
            {terms.map((document, index) => (
              <Fragment key={document.path}>
                {index === 0 ? null : ' and the '}
                <DocumentLink document={document} />
              </Fragment>
            ))}{' '}
            and have read the <DocumentLink document={legalDocuments.privacy} />
          </>
        }
        checked={checked}
        onCheckedChange={(value) => {
          onCheckedChange(value === true);
        }}
        aria-invalid={error ? true : undefined}
      />
      {error ? (
        <p role="alert" className="-mt-2 text-small font-medium text-red">
          {error}
        </p>
      ) : null}
    </div>
  );
}
