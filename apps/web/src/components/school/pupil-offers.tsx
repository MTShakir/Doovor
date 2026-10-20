'use client';

import type { Result } from '@repo/core/result';
import { Button } from '@repo/ui/button';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { StatusPill } from '@repo/ui/status-pill';
import { toast } from '@repo/ui/toast';
import { useState } from 'react';
import type { PupilOffer } from '@/lib/school/pupil-offers';

const gearboxWords = { manual: 'Manual', automatic: 'Automatic' } as const;

export interface PupilOfferHandlers {
  answer: (input: { offerId: string; accept: boolean }) => Promise<Result<null>>;
  /** M9-19: an accepted pupil put on the instructor's own list of learners. */
  addLearner?: (enquiryId: string) => Promise<Result<null>>;
  refresh: () => void;
}

/**
 * The pupils a school offers a linked instructor, and those they accepted (M9-17, D-289). Until they
 * accept, a first name, the area and when suits; then who they are and how to reach them.
 */
export function PupilOffers({ school, offers, handlers }: { school: string; offers: readonly PupilOffer[]; handlers: PupilOfferHandlers }) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const run = async (id: string, work: () => Promise<Result<null>>, done: string) => {
    setBusyId(id);
    const result = await work();
    setBusyId(null);
    toast(result.ok ? done : result.message);
    handlers.refresh();
  };

  return (
    <Card className="flex flex-col gap-4" role="region" aria-labelledby="pupil-offers-title">
      <div className="flex flex-col gap-1">
        <CardTitle id="pupil-offers-title">Pupils from {school}</CardTitle>
        <CardDescription>
          The school offers you pupils near you. The first instructor to accept gets them, and they become your learner.
        </CardDescription>
      </div>
      {offers.length === 0 ? (
        <p className="text-small text-grey-700">Nothing offered just now.</p>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Pupils offered and accepted">
          {offers.map((offer) => (
            <li key={offer.offerId} className="flex flex-col gap-3 rounded-card border border-grey-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col">
                  <h3 className="text-h3 text-black">{offer.contact?.fullName ?? `${offer.firstName}, ${offer.district}`}</h3>
                  <p className="text-small text-grey-700">
                    {offer.transmission === null ? 'Either gearbox' : gearboxWords[offer.transmission]}
                    {offer.note === null ? '' : `, ${offer.note}`}
                  </p>
                </div>
                <StatusPill status={offer.status === 'open' ? 'attention' : 'confirmed'}>{offer.status === 'open' ? 'Offered' : 'Yours'}</StatusPill>
              </div>
              {offer.contact === null ? (
                <>
                  <p className="text-small text-ink">Answer by {offer.answerBy}.</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      pending={busyId === offer.offerId}
                      onClick={() => {
                        void run(offer.offerId, () => handlers.answer({ offerId: offer.offerId, accept: true }), `${offer.firstName} is yours`);
                      }}
                    >
                      Accept
                    </Button>
                    <Button
                      variant="tertiary"
                      disabled={busyId === offer.offerId}
                      onClick={() => {
                        void run(offer.offerId, () => handlers.answer({ offerId: offer.offerId, accept: false }), 'Declined');
                      }}
                    >
                      Decline
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <dl className="grid gap-1 text-small text-ink sm:grid-cols-[auto_1fr] sm:gap-x-4">
                    <dt className="font-semibold">Postcode</dt>
                    <dd>{offer.contact.postcode}</dd>
                    {offer.contact.email ? (
                      <>
                        <dt className="font-semibold">Email</dt>
                        <dd className="break-all">
                          <a className="text-blue underline underline-offset-4" href={`mailto:${offer.contact.email}`}>
                            {offer.contact.email}
                          </a>
                        </dd>
                      </>
                    ) : null}
                    {offer.contact.phone ? (
                      <>
                        <dt className="font-semibold">Mobile</dt>
                        <dd>
                          <a className="text-blue underline underline-offset-4" href={`tel:${offer.contact.phone.replace(/\s/g, '')}`}>
                            {offer.contact.phone}
                          </a>
                        </dd>
                      </>
                    ) : null}
                  </dl>
                  {offer.learnerAdded ? (
                    <p className="text-small font-semibold text-ink">On your list of learners.</p>
                  ) : handlers.addLearner ? (
                    <div>
                      <Button
                        variant="secondary"
                        pending={busyId === offer.offerId}
                        onClick={() => {
                          const add = handlers.addLearner;
                          if (add) void run(offer.offerId, () => add(offer.enquiryId), 'Added to your learners');
                        }}
                      >
                        Add to my learners
                      </Button>
                    </div>
                  ) : (
                    <p className="text-small text-grey-700">Get in touch, and add them to your learners.</p>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
