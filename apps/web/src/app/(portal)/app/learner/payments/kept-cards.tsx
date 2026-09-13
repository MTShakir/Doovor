'use client';

import { Card, CardTitle } from '@repo/ui/card';
import { toast, toastWithUndo, UNDO_WINDOW_MS } from '@repo/ui/toast';
import { CreditCard, Trash2 } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { forgetCard } from './actions';

export interface KeptCardRow {
  paymentMethodId: string;
  /** "Visa ending 4242". */
  label: string;
  /** "12/30". */
  expiry: string;
}

export interface KeptCardsProps {
  businessId: string;
  businessName: string;
  cards: KeptCardRow[];
}

/**
 * The cards kept with one Business, and removing them (PAY-02, M3-07).
 *
 * Removing waits five seconds before it happens, so it can be undone (PRD 7.1). The five
 * seconds are counted here rather than by the toast, which stands still while a pointer rests
 * on it: a removal that waits for the mouse to move is a bug. The wait outlives the page, the
 * way the toast does, so Undo still means undo after somebody has moved on.
 */
export function KeptCards({ businessId, businessName, cards }: KeptCardsProps) {
  const titleId = useId();
  const [removed, setRemoved] = useState<string[]>([]);
  const waiting = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const remove = (card: KeptCardRow) => {
    setRemoved((current) => [...current, card.paymentMethodId]);

    const removing = setTimeout(() => {
      waiting.current.delete(card.paymentMethodId);
      void forgetCard({ businessId, paymentMethodId: card.paymentMethodId }).then((result) => {
        if (result.ok) return;
        // It is still there, so it is shown again rather than leaving a gap that is not real.
        setRemoved((current) => current.filter((id) => id !== card.paymentMethodId));
        toast(result.message);
      });
    }, UNDO_WINDOW_MS);
    waiting.current.set(card.paymentMethodId, removing);

    toastWithUndo(`${card.label} removed`, () => {
      clearTimeout(removing);
      waiting.current.delete(card.paymentMethodId);
      setRemoved((current) => current.filter((id) => id !== card.paymentMethodId));
    });
  };

  const shown = cards.filter((card) => !removed.includes(card.paymentMethodId));

  return (
    <Card padding="none" role="region" aria-labelledby={titleId}>
      <div className="px-4 pt-4 pb-3">
        <CardTitle id={titleId}>{businessName}</CardTitle>
      </div>

      {shown.length === 0 ? (
        <p className="px-4 pb-4 text-small text-grey-700">No cards saved with {businessName}.</p>
      ) : (
        <ul className="flex flex-col border-t border-grey-200">
          {shown.map((card) => (
            <li key={card.paymentMethodId} className="flex items-center gap-3 border-b border-grey-200 px-4 py-2 last:border-b-0">
              <CreditCard className="size-5 shrink-0 text-grey-700" aria-hidden />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body font-medium text-ink">{card.label}</span>
                <span className="text-small text-grey-700">Expires {card.expiry}</span>
              </span>
              <button
                type="button"
                onClick={() => { remove(card); }}
                aria-label={`Remove ${card.label}`}
                className="flex size-12 shrink-0 items-center justify-center rounded-full text-black hover:bg-grey-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-black"
              >
                <Trash2 className="size-5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
