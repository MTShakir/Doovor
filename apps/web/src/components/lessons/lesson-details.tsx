'use client';

import { lessonState, lessonStateLabel } from '@repo/core/diary';
import { lessonToStart } from '@repo/core/lesson-records';
import { formatPence } from '@repo/core/money';
import { whatsAppTo } from '@repo/core/phone';
import { formatDate, formatTime } from '@repo/core/time';
import { Button } from '@repo/ui/button';
import { cn } from '@repo/ui/lib/cn';
import { Sheet } from '@repo/ui/sheet';
import { Skeleton } from '@repo/ui/skeleton';
import { StatusPill } from '@repo/ui/status-pill';
import { toast } from '@repo/ui/toast';
import { Banknote, CalendarClock, Mail, MapPin, MessageCircle, MessageSquare, Navigation, Phone, UserRound, X } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useEffect, useState, useTransition, type ReactNode } from 'react';
import { lessonDetailsFor, sendReminder } from '@/app/(portal)/app/instructor/booking-actions';
import { LessonSheets } from '@/components/diary/lesson-sheets';
import { StartLessonButton } from '@/components/lessons/start-lesson';
import type { LessonDetails } from '@/lib/lessons/details';

/** What a lesson's card already knows, so the sheet opens with it at once. */
export interface LessonAtAGlance {
  id: string;
  startsAt: string;
  endsAt: string;
  learnerName: string;
  lessonType: string;
}

/** Directions to a pickup in whatever maps app the phone opens a maps link with. */
export function directionsTo(pickup: { address: string | null; postcode: string | null }): string | null {
  const place = [pickup.address, pickup.postcode].filter((part) => part !== null && part.trim() !== '').join(', ');
  return place === '' ? null : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place)}`;
}

/** A chat in WhatsApp with a UK mobile, which wa.me wants as digits without the plus. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <h3 className="text-small font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}

type Action = 'move' | 'cancel' | 'paid';
type Channel = 'email' | 'sms';

/** What the sheet has to show: on its way, not to be had without signal, or the lesson itself. */
export type LessonDetailsState =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'ready'; details: LessonDetails; ahead: boolean; startable: boolean; editable: boolean };

/**
 * What a lesson's sheet says (DIA-04, LRN-02, D-166): when and where, the learner's number with a
 * call, a text and a WhatsApp, a reminder by hand, and the things an instructor does to a lesson
 * that is in. It shows what it is given and says what was tapped; the sheet does the rest.
 */
export function LessonDetailsBody({
  state,
  sending,
  onRemind,
  onAction,
}: {
  state: LessonDetailsState;
  /** The reminder on its way, if one is. */
  sending: Channel | null;
  onRemind: (channel: Channel) => void;
  onAction: (action: Action) => void;
}) {
  if (state.kind === 'failed') {
    return <p className="text-body text-ink">Open this lesson again once you have signal to see everything about it.</p>;
  }
  if (state.kind === 'loading') {
    return (
      <div className="flex flex-col gap-3" aria-busy>
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  const { details, ahead, startable, editable } = state;
  const lessonFacts = { status: details.status, paymentStatus: details.paymentStatus, kind: details.kind, source: details.source };
  const off = details.status === 'cancelled' || details.status === 'declined' || details.status === 'expired';
  const asked = details.status === 'requested';
  const done = details.status === 'completed' || details.status === 'no_show';
  const payable = !asked && !off && details.pricePence > 0 && ['unpaid', 'pending', 'failed'].includes(details.paymentStatus);
  const route = details.pickup ? directionsTo(details.pickup) : null;
  const phone = details.learner.phone;
  const remindable = details.status === 'confirmed' && ahead;
  const changeable = editable && !asked && !off && !done;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusPill status={lessonState(lessonFacts)}>{lessonStateLabel(lessonFacts)}</StatusPill>
        <span className="text-body font-semibold text-black tabular-nums">{formatPence(details.pricePence)}</span>
      </div>

      {startable ? <StartLessonButton bookingId={details.id} endsAt={details.endsAt} /> : null}

      <Section title="Pickup">
        {details.pickup ? (
          <div className="flex flex-col gap-2">
            <p className="flex items-start gap-2 text-body text-ink">
              <MapPin className="mt-0.5 size-5 shrink-0" aria-hidden />
              <span>
                {details.pickup.label}
                {details.pickup.address || details.pickup.postcode ? (
                  <span className="block text-small text-grey-700">
                    {[details.pickup.address, details.pickup.postcode].filter(Boolean).join(', ')}
                  </span>
                ) : null}
              </span>
            </p>
            {route ? (
              <Button asChild variant="secondary" className="self-start">
                <a href={route} target="_blank" rel="noreferrer">
                  <Navigation className="size-5" aria-hidden />
                  Navigate
                </a>
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="text-small text-grey-700">No pickup point on this lesson.</p>
        )}
      </Section>

      <Section title={`Get in touch with ${details.learner.name}`}>
        {phone ? (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary">
              <a href={`tel:${phone}`}>
                <Phone className="size-5" aria-hidden />
                Call
              </a>
            </Button>
            <Button asChild variant="secondary">
              <a href={`sms:${phone}`}>
                <MessageSquare className="size-5" aria-hidden />
                Text
              </a>
            </Button>
            <Button asChild variant="secondary">
              <a href={whatsAppTo(phone)} target="_blank" rel="noreferrer">
                <MessageCircle className="size-5" aria-hidden />
                WhatsApp
              </a>
            </Button>
          </div>
        ) : (
          <p className="text-small text-grey-700">No phone number for {details.learner.name} yet.</p>
        )}
      </Section>

      {remindable ? (
        <Section title="Send a reminder">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              pending={sending === 'email'}
              disabled={details.learner.email === null}
              onClick={() => { onRemind('email'); }}
            >
              <Mail className="size-5" aria-hidden />
              By email
            </Button>
            <Button
              variant="secondary"
              pending={sending === 'sms'}
              disabled={!details.textReminders}
              onClick={() => { onRemind('sms'); }}
            >
              <MessageSquare className="size-5" aria-hidden />
              By SMS
            </Button>
          </div>
          {details.learner.email === null ? (
            <p className="text-small text-grey-700">No email address for {details.learner.name}.</p>
          ) : null}
          {details.textReminders ? null : (
            <p className="text-small text-grey-700">
              {phone === null ? `No phone number for ${details.learner.name}, so no text.` : 'Text reminders come with Pro.'}
            </p>
          )}
        </Section>
      ) : null}

      {payable || changeable ? (
        <Section title="This lesson">
          <div className="flex flex-wrap gap-2">
            {payable ? (
              <Button variant="secondary" onClick={() => { onAction('paid'); }}>
                <Banknote className="size-5" aria-hidden />
                Mark paid
              </Button>
            ) : null}
            {changeable ? (
              <>
                <Button variant="secondary" onClick={() => { onAction('move'); }}>
                  <CalendarClock className="size-5" aria-hidden />
                  Edit lesson
                </Button>
                {/*
                  UX: "Cancel lesson", not "Cancel". In a sheet, next to an X, "Cancel" is the
                  word for closing what is open, so this read as the way out of the sheet while
                  it actually calls the lesson off, tells the learner and can charge a late fee.
                */}
                <Button variant="tertiary" onClick={() => { onAction('cancel'); }}>
                  <X className="size-5" aria-hidden />
                  Cancel lesson
                </Button>
              </>
            ) : null}
          </div>
        </Section>
      ) : null}

      <Link
        href={`/app/instructor/learners/${details.learner.id}` as Route}
        className="flex h-12 w-fit items-center gap-2 rounded-full text-body font-semibold text-black underline-offset-4 hover:underline"
      >
        <UserRound className="size-5" aria-hidden />
        Open {details.learner.name}&apos;s card
      </Link>
    </div>
  );
}

/**
 * One lesson, opened from its card on Today or in the diary (DIA-04, LRN-02, D-166). Reads the
 * lesson when it opens, sends a reminder when asked, and hands Mark paid, Move and Cancel to the
 * sheets that already do them.
 */
export function LessonDetailsSheet({ lesson, onClose }: { lesson: LessonAtAGlance; onClose: () => void }) {
  const [state, setState] = useState<LessonDetailsState>({ kind: 'loading' });
  const [action, setAction] = useState<Action | null>(null);
  const [sending, setSending] = useState<Channel | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let current = true;
    void lessonDetailsFor({ bookingId: lesson.id })
      .then((result) => {
        if (!current) return;
        // Whether it is still to come, decided when it opened rather than again on every redraw.
        if (!result.ok) {
          setState({ kind: 'failed' });
          return;
        }
        const details = result.data;
        const one = {
          id: details.id,
          startsAt: new Date(details.startsAt),
          endsAt: new Date(details.endsAt),
          status: details.status,
          recorded: false,
        };
        setState({
          kind: 'ready',
          details,
          ahead: one.startsAt.getTime() > Date.now(),
          // Until it is over, not until it starts: extending a lesson is decided during it (D-190).
          editable: one.endsAt.getTime() > Date.now(),
          // The same quarter of an hour the card on Today uses (D-178, D-184).
          startable: lessonToStart([one], new Date()) !== null,
        });
      })
      // No signal: the card said what it knows, and the rest waits for a connection.
      .catch(() => { if (current) setState({ kind: 'failed' }); });
    return () => {
      current = false;
    };
  }, [lesson.id]);

  if (state.kind === 'ready' && action) {
    const { details } = state;
    return (
      <LessonSheets
        lesson={{
          bookingId: details.id,
          learnerId: details.learner.id,
          learnerName: details.learner.name,
          startsAt: details.startsAt,
          durationMinutes: Math.round((new Date(details.endsAt).getTime() - new Date(details.startsAt).getTime()) / 60_000),
          pricePence: details.pricePence,
          paymentStatus: details.paymentStatus,
        }}
        rules={details.rules}
        action={action}
        onClose={onClose}
      />
    );
  }

  // Sent the way the automatic reminders go, so what the learner switched off stays off (D-166).
  const remind = (channel: Channel) => {
    setSending(channel);
    startTransition(async () => {
      const result = await sendReminder({ bookingId: lesson.id, channel });
      setSending(null);
      const how = channel === 'email' ? 'by email' : 'by text';
      if (result.ok) toast(`Reminder on its way to ${lesson.learnerName} ${how}`);
      else if (result.code === 'RATE_LIMITED') toast(`A reminder went ${how} within the last hour`);
      else if (result.code === 'PLAN_REQUIRED') toast('Text reminders come with Pro');
      else toast(result.message);
    });
  };

  const startsAt = new Date(lesson.startsAt);
  return (
    <Sheet
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={lesson.learnerName}
      description={`${formatDate(startsAt)}, ${formatTime(startsAt)} to ${formatTime(new Date(lesson.endsAt))}. ${lesson.lessonType}.`}
    >
      <LessonDetailsBody state={state} sending={sending} onRemind={remind} onAction={setAction} />
    </Sheet>
  );
}

/**
 * The part of a lesson's card that opens it (DIA-04, D-166). A button around what the card says,
 * so the card's own buttons, Navigate or Move, stay buttons of their own beside it.
 */
export function OpenLesson({
  lesson,
  className,
  shouldOpen,
  children,
}: {
  lesson: LessonAtAGlance;
  className?: string;
  /** Asked first: a lesson held down on a phone has just opened Move instead. */
  shouldOpen?: () => boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={`Open ${formatTime(new Date(lesson.startsAt))} with ${lesson.learnerName}`}
        className={cn(
          'w-full cursor-pointer rounded-input text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black',
          className,
        )}
        onClick={() => { if (shouldOpen?.() ?? true) setOpen(true); }}
      >
        {children}
      </button>
      {open ? <LessonDetailsSheet lesson={lesson} onClose={() => { setOpen(false); }} /> : null}
    </>
  );
}
