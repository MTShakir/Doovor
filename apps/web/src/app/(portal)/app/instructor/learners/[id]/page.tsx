import type { Metadata } from 'next';
import { learnerStatusLabels } from '@repo/core/learners';
import { formatDateTime, formatMinutes } from '@repo/core/time';
import { PageHeader } from '@repo/ui/app-shell';
import { Button } from '@repo/ui/button';
import { Card, CardTitle } from '@repo/ui/card';
import { ListDivider, ListRow } from '@repo/ui/list-row';
import { SkeletonRow } from '@repo/ui/skeleton';
import { StatusPill } from '@repo/ui/status-pill';
import { ChevronLeft, Mail, MessageSquare, Phone } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Fragment, Suspense } from 'react';
import { requirePortal } from '@/lib/auth/session';
import { learnerCard, type LearnerCard } from '@/lib/learners/card';
import { learnerNotes } from '@/lib/learners/notes';
import { statusPill } from '@/lib/learners/status-pill';
import { Notes } from './notes';

export const metadata: Metadata = { title: 'Learner' };

interface LearnerPageProps {
  params: Promise<{ id: string }>;
}

export default function LearnerPage({ params }: LearnerPageProps) {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <Suspense fallback={<SkeletonRow />}>
        <Learner params={params} />
      </Suspense>
    </main>
  );
}

/** LRN-02: one learner, everything about them an instructor needs before a lesson. */
async function Learner({ params }: LearnerPageProps) {
  const { id } = await params;
  const { access, session } = await requirePortal('instructor');

  const card = await learnerCard(id);
  // The view shows only learners this instructor may see, so a stranger's id is simply
  // not there, and not there and not allowed look the same from here.
  if (!card) notFound();

  const notes = await learnerNotes(card.learnerId);
  const mine = access.memberships.some((one) => one.instructorProfileId === card.instructorId);
  const gearbox = card.transmission === null ? null : card.transmission === 'manual' ? 'Manual' : 'Automatic';

  return (
    <>
      <PageHeader
        title={card.fullName}
        subtitle={[gearbox, card.postcode].filter((part) => part !== null).join(' · ')}
        back={
          <Link
            href="/app/instructor/learners"
            className="-ml-3 flex h-12 w-fit items-center gap-1 rounded-full px-3 text-body font-medium text-ink hover:bg-grey-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
          >
            <ChevronLeft size={20} strokeWidth={1.5} aria-hidden />
            Learners
          </Link>
        }
      />

      <div className="flex flex-col gap-4 px-4 md:max-w-2xl md:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={statusPill(card.status)}>{learnerStatusLabels[card.status]}</StatusPill>
          {/* Who teaches them is worth saying only to somebody who is not that person. */}
          {card.instructorName === null || mine ? null : (
            <span className="text-small text-grey-700">Taught by {card.instructorName}</span>
          )}
        </div>

        <Reach card={card} />
        <Lessons card={card} />
        <Pickups card={card} />
        <Notes learnerId={card.learnerId} notes={notes} viewerId={session.userId} />
      </div>
    </>
  );
}

/** The three ways an instructor gets hold of somebody, in the order they use them. */
function Reach({ card }: { card: LearnerCard }) {
  if (card.phone === null && card.email === null) {
    return <p className="text-small text-grey-700">No phone number or email address yet.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {card.phone === null ? null : (
        <>
          <Button asChild>
            <a href={`tel:${card.phone}`}>
              <Phone className="size-5" aria-hidden />
              Call
            </a>
          </Button>
          <Button variant="secondary" asChild>
            <a href={`sms:${card.phone}`}>
              <MessageSquare className="size-5" aria-hidden />
              Text
            </a>
          </Button>
        </>
      )}
      {card.email === null ? null : (
        <Button variant="secondary" asChild>
          <a href={`mailto:${card.email}`}>
            <Mail className="size-5" aria-hidden />
            Email
          </a>
        </Button>
      )}
    </div>
  );
}

function Lessons({ card }: { card: LearnerCard }) {
  return (
    <Card padding="none" role="region" aria-labelledby="lessons-title">
      <div className="px-4 pt-4">
        <CardTitle id="lessons-title">Lessons</CardTitle>
      </div>
      <ListRow title="Taken" trailing={String(card.lessonsTaken)} />
      <ListDivider />
      <ListRow title="Hours driven" trailing={card.minutesTaught === 0 ? 'None yet' : formatMinutes(card.minutesTaught)} />
      <ListDivider />
      <ListRow
        title="Usual lesson"
        trailing={card.usualDurationMinutes === null ? 'Not set' : formatMinutes(card.usualDurationMinutes)}
      />
      <ListDivider />
      <ListRow
        title="Next lesson"
        trailing={card.nextLessonAt === null ? 'None booked' : formatDateTime(new Date(card.nextLessonAt))}
      />
      <ListDivider />
      <ListRow
        title="Last lesson"
        trailing={card.lastLessonAt === null ? 'None yet' : formatDateTime(new Date(card.lastLessonAt))}
      />
    </Card>
  );
}

/** COV-04: where to pick them up, the default first. */
function Pickups({ card }: { card: LearnerCard }) {
  return (
    <Card padding="none" role="region" aria-labelledby="pickups-title">
      <div className="px-4 pt-4">
        <CardTitle id="pickups-title">Pickup points</CardTitle>
      </div>
      {card.pickups.length === 0 ? (
        <p className="px-4 py-4 text-small text-grey-700">
          None saved yet. They can add one, or you can when you book a lesson.
        </p>
      ) : (
        card.pickups.map((pickup, index) => (
          <Fragment key={pickup.id}>
            {index === 0 ? null : <ListDivider />}
            <ListRow
              title={pickup.label}
              subtitle={[pickup.postcode, pickup.address].filter((part) => part !== null && part !== '').join(' · ')}
              trailing={pickup.is_default ? <StatusPill status="credit">Default</StatusPill> : undefined}
            />
          </Fragment>
        ))
      )}
    </Card>
  );
}
