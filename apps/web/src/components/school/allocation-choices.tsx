'use client';

import type { Suggestion } from '@repo/core/allocation';
import { SkeletonRow } from '@repo/ui/skeleton';
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';

export type AllocationState =
  | { kind: 'loading' }
  | { kind: 'ready'; suggestions: Suggestion[]; everybody: { id: string; name: string }[] }
  /** The suggestions could not be worked out: everybody can still be chosen by hand. */
  | { kind: 'failed'; everybody: { id: string; name: string }[] };

export interface AllocationChoicesProps {
  state: AllocationState;
  /** Who teaches the learner now, by name. */
  current: string | null;
  disabled: boolean;
  onChoose: (instructor: { id: string; name: string }) => void;
  /** Keeps the headings' ids unique where the choices appear more than once, as on the design page. */
  idPrefix?: string;
}

/** How many suggestions to show: enough to choose from, few enough to read on a phone. */
const SHOWN = 3;

function Choice({
  name,
  current,
  disabled,
  onChoose,
  children,
}: {
  name: string;
  current: boolean;
  disabled: boolean;
  onChoose: () => void;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-current={current}
      onClick={onChoose}
      className="flex min-h-14 items-center gap-3 rounded-card px-4 py-3 text-left hover:bg-grey-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-black disabled:opacity-60"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-body font-semibold text-black">{name}</span>
        {children}
      </span>
      {current ? <Check className="size-5 shrink-0 text-black" aria-hidden /> : null}
    </button>
  );
}

function Group({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-1">
      <h3 id={id} className="px-4 text-small font-semibold text-grey-700">
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * SCH-03, LRN-06: who could teach a learner. The best few first, each with why, then everybody
 * else still teaching at the school, so any of them can be chosen by hand. Nothing can be tapped
 * until the list has settled, so a row never moves under a finger.
 */
export function AllocationChoices({ state, current, disabled, onChoose, idPrefix = 'allocation' }: AllocationChoicesProps) {
  if (state.kind === 'loading') {
    return (
      <div aria-hidden className="flex flex-col gap-2">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    );
  }

  const suggested = state.kind === 'ready' ? state.suggestions.slice(0, SHOWN) : [];
  const suggestedIds = new Set(suggested.map((one) => one.instructorId));
  const others = state.everybody.filter((one) => !suggestedIds.has(one.id));

  return (
    <div className="flex flex-col gap-4">
      {state.kind === 'failed' ? (
        <p className="px-4 text-small text-grey-700">We could not work out who suits them best just now. Anybody below can still teach them.</p>
      ) : (
        <Group id={`${idPrefix}-suggested`} title="Suggested">
          {suggested.length === 0 ? (
            <p className="px-4 py-2 text-small text-grey-700">Nobody here teaches the gearbox they want yet. Choose anybody below.</p>
          ) : (
            suggested.map((one) => (
              <Choice
                key={one.instructorId}
                name={one.name}
                current={one.name === current}
                disabled={disabled}
                onChoose={() => { onChoose({ id: one.instructorId, name: one.name }); }}
              >
                {/* Words only inside a button: a list there is not allowed, so each reason is a line. */}
                <span className="flex flex-col text-small text-grey-700">
                  {one.reasons.map((reason) => (
                    <span key={reason}>{reason}</span>
                  ))}
                </span>
              </Choice>
            ))
          )}
        </Group>
      )}
      {others.length > 0 ? (
        <Group id={`${idPrefix}-everybody`} title={suggested.length > 0 ? 'Everybody else' : 'Everybody'}>
          {others.map((one) => (
            <Choice key={one.id} name={one.name} current={one.name === current} disabled={disabled} onChoose={() => { onChoose(one); }} />
          ))}
        </Group>
      ) : null}
    </div>
  );
}
