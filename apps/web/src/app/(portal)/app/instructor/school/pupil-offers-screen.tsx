'use client';

import { useRouter } from 'next/navigation';
import { PupilOffers } from '@/components/school/pupil-offers';
import type { PupilOffer } from '@/lib/school/pupil-offers';
import { answerOffer } from './actions';

/** The pupils offered to a linked instructor, with their own answers behind them (M9-17, D-289). */
export function PupilOffersScreen({ school, offers }: { school: string; offers: PupilOffer[] }) {
  const router = useRouter();
  return <PupilOffers school={school} offers={offers} handlers={{ answer: answerOffer, refresh: () => { router.refresh(); } }} />;
}
