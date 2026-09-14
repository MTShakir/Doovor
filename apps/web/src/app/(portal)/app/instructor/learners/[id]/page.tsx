import type { Metadata } from 'next';
import { formatDateTime, formatMinutes } from '@repo/core/time';
import type { AccessContext } from '@repo/db';
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
import { BalanceHistory, BalanceLines, OwedBackList, OwedLessons } from '@/components/money/balance';
import { MarkPaidButton } from '@/components/money/mark-paid';
import { requirePortal } from '@/lib/auth/session';
import { learnerCard, type LearnerCard } from '@/lib/learners/card';
import { learnerHistory, type LearnerHistoryEntry } from '@/lib/learners/history';
import { learnerNotes } from '@/lib/learners/notes';
import { learnerBalance } from '@/lib/payments/balance';
import { noShowDisputes } from '@/lib/payments/disputes';
import { packagesForSale } from '@/lib/payments/packages';
import { BookLesson } from '../../book-lesson';
import { HandBack } from './hand-back';
import { NoShowDisputes } from './no-show-disputes';
import { Notes } from './notes';
import { RefundPayment } from './refund-payment';
import { SellPackage } from './sell-package';
import { StatusControl } from './status-control';

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

  const [notes, history] = await Promise.all([learnerNotes(card.learnerId), learnerHistory(card.learnerId)]);
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
          <StatusControl learnerId={card.learnerId} status={card.status} name={card.fullName} />
          {/* Who teaches them is worth saying only to somebody who is not that person. */}
          {card.instructorName === null || mine ? null : (
            <span className="text-small text-grey-700">Taught by {card.instructorName}</span>
          )}
        </div>

        <Reach card={card} />
        {mine ? (
          <BookLesson
            learners={[{ id: card.learnerId, name: card.fullName, usualDurationMinutes: card.usualDurationMinutes }]}
            learnerId={card.learnerId}
            label={`Book a lesson for ${card.fullName.split(' ')[0] ?? card.fullName}`}
            variant="secondary"
          />
        ) : null}
        <Lessons card={card} />
        <Money card={card} access={access} />
        <Pickups card={card} />
        <Notes learnerId={card.learnerId} notes={notes} viewerId={session.userId} />
        <History entries={history} />
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

/**
 * PAY-05, PAY-06, M3-16, M3-18: the learner's balance here, the same one they see on their own
 * Payments screen, what they owe with a way to mark it paid, money owed back with a way to mark it
 * handed back, and a package paid for in person.
 */
async function Money({ card, access }: { card: LearnerCard; access: AccessContext }) {
  const [balance, packages, disputes] = await Promise.all([
    learnerBalance(card.businessId, card.learnerId),
    packagesForSale(card.businessId),
    noShowDisputes(card.businessId, card.learnerId),
  ]);
  if (!balance) return null;

  // A lesson is marked paid by the instructor who taught it, or by somebody who runs the Business.
  const here = access.memberships.filter((one) => one.businessId === card.businessId);
  const runsIt = here.some((one) => one.role === 'owner' || one.role === 'manager');
  const mine = new Set(here.map((one) => one.instructorProfileId).filter((id): id is string => id !== null));

  return (
    <Card padding="none" role="region" aria-labelledby="money-title">
      <div className="flex flex-col gap-2 px-4 pt-4 pb-3">
        <CardTitle id="money-title">Money</CardTitle>
        <BalanceLines balance={balance} />
      </div>
      <OwedLessons
        balance={balance}
        action={(owed, instructor) =>
          runsIt || (instructor !== null && mine.has(instructor.id)) ? (
            <MarkPaidButton
              lesson={{
                bookingId: owed.lesson.id,
                learnerName: card.fullName,
                startsAt: owed.lesson.startsAt.toISOString(),
                pricePence: owed.amountPence,
                fee: owed.fee ?? undefined,
              }}
            />
          ) : null
        }
      />
      <OwedBackList
        balance={balance}
        action={(owed) =>
          runsIt || (owed.instructorId !== null && mine.has(owed.instructorId)) ? (
            <HandBack refundId={owed.refundId} learnerId={card.learnerId} learnerName={card.fullName} amountPence={owed.amountPence} />
          ) : null
        }
      />
      <NoShowDisputes disputes={disputes} learnerId={card.learnerId} learnerName={card.fullName} canDecide={runsIt} />
      {packages.length === 0 ? null : (
        <div className="flex border-t border-grey-200 px-4 py-3">
          <SellPackage learnerId={card.learnerId} learnerName={card.fullName} packages={packages} />
        </div>
      )}
      <BalanceHistory
        history={balance.history}
        limit={10}
        action={
          // Money goes back only by the people who run the Business (PAY-07, PRD 6.2), and only
          // while some of it is not already on its way back or owed back (M3-18).
          runsIt
            ? (entry) =>
                entry.kind === 'payment' &&
                entry.method !== 'credit' &&
                entry.refundedPence + entry.pendingRefundPence < entry.amountPence ? (
                  <RefundPayment paymentId={entry.id} learnerId={card.learnerId} learnerName={card.fullName} />
                ) : null
            : undefined
        }
      />
    </Card>
  );
}

/** LRN-06: what has happened to this learner here, newest first. */
function History({ entries }: { entries: LearnerHistoryEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <Card padding="none" role="region" aria-labelledby="history-title">
      <div className="px-4 pt-4">
        <CardTitle id="history-title">History</CardTitle>
      </div>
      <ul className="flex flex-col py-2">
        {entries.map((entry) => (
          <li key={`${entry.at}-${entry.line}`} className="flex flex-col gap-0.5 px-4 py-2">
            <span className="text-body text-ink">{entry.line}</span>
            <span className="text-small text-grey-700">{formatDateTime(new Date(entry.at))}</span>
          </li>
        ))}
      </ul>
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
