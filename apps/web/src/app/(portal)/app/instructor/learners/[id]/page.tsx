import type { Metadata } from 'next';
import { skillMapSummary } from '@repo/core/skill-map';
import { formatPence } from '@repo/core/money';
import { whatsAppTo } from '@repo/core/phone';
import { formatDateTime, formatDateWithYear, formatMinutes, todayInZone } from '@repo/core/time';
import type { AccessContext } from '@repo/db';
import { PageHeader } from '@repo/ui/app-shell';
import { Button } from '@repo/ui/button';
import { Card, CardTitle } from '@repo/ui/card';
import { ListDivider, ListRow } from '@repo/ui/list-row';
import { SkeletonRow } from '@repo/ui/skeleton';
import { ChevronLeft, Mail, MessageCircle, MessageSquare, Phone, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { PickupPoints } from '@/components/learners/pickup-points';
import { BalanceHistory, BalanceLines, OwedBackList, OwedLessons } from '@/components/money/balance';
import { MarkPaidButton } from '@/components/money/mark-paid';
import { lessonWhen } from '@/components/progress/lesson-record-card';
import { requirePortal } from '@/lib/auth/session';
import { learnerCard, type LearnerCard } from '@/lib/learners/card';
import { learnerLessons, learnerTotals, type LearnerTotals } from '@/lib/learners/totals';
import { learnerHistory, type LearnerHistoryEntry } from '@/lib/learners/history';
import { learnerHealth, type LearnerHealth } from '@/lib/learner/health';
import { learnerDriving, type LearnerDriving } from '@/lib/learner/setup';
import { learnerNotes } from '@/lib/learners/notes';
import { learnerPickupPoints } from '@/lib/pickup/list';
import { learnerSkillMap, lessonRecordPage } from '@/lib/lessons/records';
import { learnerBalance } from '@/lib/payments/balance';
import { noShowDisputes } from '@/lib/payments/disputes';
import { packagesForSale } from '@/lib/payments/packages';
import { BookLesson } from '../../book-lesson';
import { addLearnerPickup, removeLearnerPickup, updateLearnerPickup } from './actions';
import { HandBack } from './hand-back';
import { LearnerTabs, LessonHistoryTabs } from './learner-tabs';
import { LessonRows } from './lesson-rows';
import { NoShowDisputes } from './no-show-disputes';
import { Notes } from './notes';
import { RefundPayment } from './refund-payment';
import { SellPackage } from './sell-package';
import { StatusControl } from './status-control';

export const metadata: Metadata = { title: 'Learner' };

interface LearnerPageProps {
  params: Promise<{ id: string }>;
  /** `?add=pickup` opens the add form straight away, for somebody sent here from a lesson (D-222). */
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default function LearnerPage({ params, searchParams }: LearnerPageProps) {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <Suspense fallback={<SkeletonRow />}>
        <Learner params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/** LRN-02: one learner, everything about them an instructor needs before a lesson. */
async function Learner({ params, searchParams }: LearnerPageProps) {
  const { id } = await params;
  const addPickup = (await searchParams)?.add === 'pickup';
  const { access, session } = await requirePortal('instructor');

  const card = await learnerCard(id);
  // The view shows only learners this instructor may see, so a stranger's id is simply
  // not there, and not there and not allowed look the same from here.
  if (!card) notFound();

  const [notes, history, pickups, health, driving, totals, lessons, balance] = await Promise.all([
    learnerNotes(card.learnerId),
    learnerHistory(card.learnerId),
    learnerPickupPoints(card.learnerId, card.businessId),
    learnerHealth(card.learnerId),
    learnerDriving(card.learnerId),
    learnerTotals(card.businessId, card.learnerId),
    learnerLessons(card.businessId, card.learnerId),
    learnerBalance(card.businessId, card.learnerId),
  ]);
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
          />
        ) : null}
        <LearnerTabs
          tabs={[
            {
              value: 'summary',
              label: 'Summary',
              panel: (
                <>
                  <Summary card={card} totals={totals} creditMinutes={balance?.creditMinutes ?? 0} />
                  <PickupPoints
                    learnerId={card.learnerId}
                    pickups={pickups}
                    openAdd={addPickup}
                    actions={{ add: addLearnerPickup, update: updateLearnerPickup, remove: removeLearnerPickup }}
                    addedByOthers={`added by ${card.fullName}`}
                    empty={`None saved yet. Add where ${card.fullName} is collected, or they can add their own.`}
                    note={`For ${card.fullName}. They see it too.`}
                  />
                  <WhatTheyToldUs card={card} health={health} driving={driving} />
                  <Notes learnerId={card.learnerId} notes={notes} viewerId={session.userId} />
                  {/* D-222: at the foot of the summary rather than behind a tab of its own. It is
                      read after everything else about somebody, and a tab nobody opens is a tab
                      that hides what it holds. */}
                  <History entries={history} />
                </>
              ),
            },
            {
              value: 'lessons',
              label: 'Lessons',
              panel: (
                <LessonHistoryTabs
                  upcoming={
                    <LessonRows
                      lessons={lessons.upcoming}
                      label="Lessons to come"
                      empty="Nothing booked yet."
                      learnerName={card.fullName}
                    />
                  }
                  past={
                    <LessonRows
                      lessons={lessons.past}
                      label="Lessons that have been"
                      empty="No lessons yet."
                      learnerName={card.fullName}
                    />
                  }
                />
              ),
            },
            { value: 'payments', label: 'Payments', panel: <Money card={card} access={access} balance={balance} /> },
            { value: 'progress', label: 'Progress', panel: <Progress card={card} /> },
          ]}
        />
      </div>
    </>
  );
}

/**
 * What the learner chose to tell us (LRN-02, D-180, D-183): a disability, medication that could
 * affect their driving, and whether the theory test is behind them. Theirs to change, and read
 * only by the instructor who teaches them and the people who run their Business.
 */
function WhatTheyToldUs({ card, health, driving }: { card: LearnerCard; health: LearnerHealth | null; driving: LearnerDriving }) {
  const lines = [
    driving.transmission === null
      ? null
      : { term: 'Gearbox', detail: driving.transmission === 'manual' ? 'Manual' : 'Automatic' },
    health?.hasDisability === true ? { term: 'A disability or condition', detail: health.details ?? 'They did not say more.' } : null,
    health?.takesMedication === true ? { term: 'Medication', detail: health.medicationDetails ?? 'They did not say more.' } : null,
    driving.theoryPassed === null
      ? null
      : { term: 'Theory test', detail: driving.theoryPassed ? 'Passed within the last 2 years' : 'Not passed yet' },
  ].filter((line) => line !== null);
  if (lines.length === 0) return null;

  const first = card.fullName.split(' ')[0] ?? card.fullName;
  return (
    <Card className="flex flex-col gap-3" role="region" aria-labelledby="about-them-title">
      <CardTitle id="about-them-title">About them</CardTitle>
      <dl className="flex flex-col gap-2" aria-label="About them">
        {lines.map((line) => (
          <div key={line.term} className="flex flex-col">
            <dt className="text-small text-grey-700">{line.term}</dt>
            <dd className="text-body text-ink">{line.detail}</dd>
          </div>
        ))}
      </dl>
      <p className="text-small text-grey-700">
        {health === null
          ? `${first} told us this, and it is theirs to change.`
          : `${first} told us on ${formatDateWithYear(new Date(health.toldAt))}. It is theirs to change, and only you and the school see it.`}
      </p>
    </Card>
  );
}

/** The three ways an instructor gets hold of somebody, in the order they use them. */
function Reach({ card }: { card: LearnerCard }) {
  if (card.phone === null && card.email === null) {
    return <p className="text-small text-grey-700">No phone number or email address yet.</p>;
  }

  // Four ways to reach somebody, side by side rather than wrapping onto a second line (D-194):
  // equal columns however many there are, and on a phone the label sits under its icon, which is
  // the only way "WhatsApp" fits in a quarter of a 390 px screen without being cut short.
  const ways = [
    card.phone === null ? null : { key: 'call', href: `tel:${card.phone}`, icon: Phone, label: 'Call' },
    card.phone === null ? null : { key: 'text', href: `sms:${card.phone}`, icon: MessageSquare, label: 'Text' },
    card.phone === null ? null : { key: 'whatsapp', href: whatsAppTo(card.phone), icon: MessageCircle, label: 'WhatsApp', away: true },
    card.email === null ? null : { key: 'email', href: `mailto:${card.email}`, icon: Mail, label: 'Email' },
  ].filter((one) => one !== null);

  return (
    <div className="grid grid-flow-col auto-cols-fr gap-2">
      {ways.map((way) => (
        <Button
          key={way.key}
          variant={way.key === 'call' ? 'primary' : 'secondary'}
          className="flex-col gap-1 px-1 text-small sm:flex-row sm:gap-2 sm:px-4"
          asChild
        >
          <a href={way.href} {...(way.away === true ? { target: '_blank', rel: 'noreferrer' } : {})}>
            <way.icon className="size-5 shrink-0" aria-hidden />
            {way.label}
          </a>
        </Button>
      ))}
    </div>
  );
}

/**
 * The figures an instructor wants before a lesson (LRN-02, D-189): how much has been taught, how
 * much has been paid, and how much is already paid for.
 */
function Summary({ card, totals, creditMinutes }: { card: LearnerCard; totals: LearnerTotals; creditMinutes: number }) {
  return (
    <Card padding="none" role="region" aria-labelledby="lessons-title">
      <div className="px-4 pt-4">
        <CardTitle id="lessons-title">Lessons and money</CardTitle>
      </div>
      <ListRow title="Booked" trailing={String(totals.booked)} />
      <ListDivider />
      <ListRow title="Taken" trailing={String(totals.taken)} />
      <ListDivider />
      <ListRow title="Paid" trailing={formatPence(totals.paidPence)} />
      <ListDivider />
      <ListRow title="Credit left" trailing={creditMinutes === 0 ? 'None' : formatMinutes(creditMinutes)} />
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
 * PRG-03, M4-07: where the learner is with the skill map, in a line, and what their last lesson's
 * record said, with the way to every record and the whole map.
 */
async function Progress({ card }: { card: LearnerCard }) {
  const [latest, progress] = await Promise.all([lessonRecordPage(card.learnerId, undefined, 1), learnerSkillMap(card.learnerId)]);
  const last = latest.records[0];

  return (
    <Card className="flex flex-col gap-3" role="region" aria-labelledby="progress-title">
      <div className="flex flex-col gap-1">
        <CardTitle id="progress-title">Progress</CardTitle>
        <p className="text-body text-ink">{skillMapSummary(progress)}</p>
      </div>
      {last === undefined ? (
        <p className="text-small text-grey-700">No lesson records yet.</p>
      ) : (
        <div className="flex flex-col gap-0.5">
          <span className="text-small text-grey-700">Last record, {lessonWhen(last.lessonStartsAt, todayInZone().slice(0, 4))}</span>
          <p className="line-clamp-2 text-body text-ink">{last.summary}</p>
        </div>
      )}
      <Button asChild variant="secondary" width="responsive">
        <Link href={`/app/instructor/learners/${card.learnerId}/progress`}>
          <TrendingUp className="size-5" aria-hidden />
          See progress
        </Link>
      </Button>
    </Card>
  );
}

/**
 * PAY-05, PAY-06, M3-16, M3-18: the learner's balance here, the same one they see on their own
 * Payments screen, what they owe with a way to mark it paid, money owed back with a way to mark it
 * handed back, and a package paid for in person.
 */
async function Money({
  card,
  access,
  balance,
}: {
  card: LearnerCard;
  access: AccessContext;
  balance: Awaited<ReturnType<typeof learnerBalance>>;
}) {
  const [packages, disputes] = await Promise.all([
    packagesForSale(card.businessId),
    noShowDisputes(card.businessId, card.learnerId),
  ]);
  if (!balance) return null;

  // A lesson is marked paid by the instructor who taught it, or by somebody who runs the Business.
  const here = access.memberships.filter((one) => one.businessId === card.businessId);
  const runsIt = here.some((one) => one.role === 'owner' || one.role === 'manager');
  const mine = new Set(here.map((one) => one.instructorProfileId).filter((id): id is string => id !== null));

  return (
    /*
      UX (D-211): three cards, not one. What is owed, recording a package and the recent
      transactions sat inside a single outline separated by hairlines, so three unrelated things
      read as one block and none of them carried a heading of its own.
    */
    <div className="flex flex-col gap-4">
      <Card padding="none" role="region" aria-labelledby="money-title">
        <div className="flex flex-col gap-2 px-4 pt-4 pb-3">
          <CardTitle id="money-title">Payments</CardTitle>
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
      </Card>

      {packages.length === 0 ? null : (
        <Card className="flex">
          <SellPackage learnerId={card.learnerId} learnerName={card.fullName} packages={packages} />
        </Card>
      )}

      {/* Its own card now, so it is only drawn when there is something in it. */}
      {balance.history.length === 0 ? null : (
      <Card padding="none" role="region" aria-labelledby="recent-title">
        <BalanceHistory
          history={balance.history}
          limit={100}
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
      )}
    </div>
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
