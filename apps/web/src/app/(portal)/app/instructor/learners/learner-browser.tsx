'use client';

import { learnerCountLine, learnerFilterLabels, learnerFilters, type LearnerFilter } from '@repo/core/learners';
import { Button } from '@repo/ui/button';
import { Chip, ChipGroup } from '@repo/ui/chip';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { Sheet } from '@repo/ui/sheet';
import { UserPlus } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { InviteForm } from './invite-form';
import { ManualLearnerForm } from './manual-form';

export interface LearnerBrowserProps {
  search: string;
  filter: LearnerFilter;
  total: number;
  children: ReactNode;
}

const PATH = '/app/instructor/learners';
/** Long enough that a name is typed, not spelled out, into the address bar. */
const TYPING_PAUSE = 300;

/** Search, the four filters, and the one button that adds somebody (LRN-01, AUTH-07). */
export function LearnerBrowser({ search, filter, total, children }: LearnerBrowserProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Held here rather than read back from the address bar: two changes in quick succession
  // would otherwise build the second address from the state before the first.
  const [term, setTerm] = useState(search);
  const [chosen, setChosen] = useState(filter);
  const [adding, setAdding] = useState(false);
  // Two ways in, both on one screen: a link they accept, or their details typed in (LRN-03).
  const [way, setWay] = useState<'link' | 'details'>('link');
  const typing = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (typing.current) clearTimeout(typing.current); }, []);

  const show = (next: { term?: string; filter?: LearnerFilter }) => {
    const text = (next.term ?? term).trim();
    const which = next.filter ?? chosen;
    const query = new URLSearchParams();
    if (text !== '') query.set('q', text);
    if (which !== 'all') query.set('status', which);
    const address = query.size === 0 ? PATH : `${PATH}?${query.toString()}`;
    // replace, not push: a search is not a place to come back to with the back button.
    startTransition(() => { router.replace(address as Route); });
  };

  const onSearch = (value: string) => {
    setTerm(value);
    if (typing.current) clearTimeout(typing.current);
    typing.current = setTimeout(() => { show({ term: value }); }, TYPING_PAUSE);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <Field label="Search learners" hideLabel className="md:w-80">
          <Input
            type="search"
            autoComplete="off"
            placeholder="Search by name or number"
            value={term}
            onChange={(event) => { onSearch(event.target.value); }}
          />
        </Field>
        <Button width="responsive" onClick={() => { setAdding(true); }}>
          <UserPlus className="size-5" aria-hidden />
          Add a learner
        </Button>
      </div>

      <ChipGroup role="group" aria-label="Filter learners">
        {learnerFilters.map((one) => (
          <Chip
            key={one}
            selected={one === chosen}
            onClick={() => { setChosen(one); show({ filter: one }); }}
          >
            {learnerFilterLabels[one]}
          </Chip>
        ))}
      </ChipGroup>

      <p className="text-small text-grey-700" aria-live="polite">
        {learnerCountLine(total)}
      </p>

      <div aria-busy={pending} className={pending ? 'opacity-60' : undefined}>
        {children}
      </div>

      <Sheet
        open={adding}
        onOpenChange={setAdding}
        title="Add a learner"
        description="Send them a link, or put in what you already know about them."
      >
        <div className="flex flex-col gap-4">
          <ChipGroup role="group" aria-label="How to add them">
            <Chip selected={way === 'link'} onClick={() => { setWay('link'); }}>
              Send them a link
            </Chip>
            <Chip selected={way === 'details'} onClick={() => { setWay('details'); }}>
              Add their details
            </Chip>
          </ChipGroup>
          {way === 'link' ? <InviteForm /> : <ManualLearnerForm onAdded={() => { setAdding(false); }} />}
          <p className="text-small text-grey-700">
            Got a list of them already?{' '}
            <Link
              href="/app/instructor/learners/import"
              className="font-semibold text-blue underline underline-offset-4"
            >
              Import a spreadsheet
            </Link>
          </p>
        </div>
      </Sheet>
    </div>
  );
}
