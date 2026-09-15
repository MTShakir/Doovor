import { todayInZone, type LocalDate } from '@repo/core/time';
import Dexie, { type EntityTable } from 'dexie';
import type { TeachingLesson } from '@/lib/lessons/teaching';

/**
 * Today's and tomorrow's lessons, kept on the phone for where there is no signal (PRG-09, PRD 8.1,
 * M4-09). A fresh copy replaces the kept one whole, in one transaction, so the phone never holds half
 * of one read and half of another, and a read that fails leaves the last good copy where it was.
 *
 * Each lesson carries the learner's name and pickup, which is all Today and a lesson's screen show
 * of them. The skill map needs no keeping: its areas are part of the app's own code.
 */

/** A lesson as the teaching screens take it, with the day in London it falls on. */
export interface KeptLesson extends TeachingLesson {
  day: LocalDate;
}

/** What the phone knows about its copy: whose lessons, which days, and when they were read. */
interface KeptFact {
  key: 'owner' | 'days' | 'at';
  value: string;
}

type KeptStore = Dexie & {
  lessons: EntityTable<KeptLesson, 'id'>;
  facts: EntityTable<KeptFact, 'key'>;
};

let store: KeptStore | null = null;

function keptStore(): KeptStore {
  if (store === null) {
    const opened = new Dexie('kept-teaching') as KeptStore;
    opened.version(1).stores({ lessons: 'id, day, startsAt', facts: 'key' });
    store = opened;
  }
  return store;
}

/** The route's answer (apps/web/src/app/api/v1/instructor/lessons/route.ts). */
export interface KeptDaysAnswer {
  owner: string;
  days: LocalDate[];
  at: string;
  lessons: TeachingLesson[];
}

export type KeepOutcome = 'kept' | 'offline' | 'refused';

/** Reads today's and tomorrow's lessons and keeps them in place of whatever was kept before. */
export async function keepDays(fetcher: typeof fetch = fetch): Promise<KeepOutcome> {
  let response: Response;
  try {
    response = await fetcher('/api/v1/instructor/lessons', { headers: { accept: 'application/json' }, cache: 'no-store' });
  } catch {
    return 'offline';
  }
  if (!response.ok) return 'refused';
  const body = (await response.json()) as { ok: true; data: KeptDaysAnswer } | { ok: false };
  if (!body.ok) return 'refused';

  const { owner, days, at, lessons } = body.data;
  const db = keptStore();
  await db.transaction('rw', db.lessons, db.facts, async () => {
    await db.lessons.clear();
    await db.lessons.bulkPut(lessons.map((lesson) => ({ ...lesson, day: todayInZone(new Date(lesson.startsAt)) })));
    await db.facts.bulkPut([
      { key: 'owner', value: owner },
      { key: 'days', value: days.join(',') },
      { key: 'at', value: at },
    ]);
  });
  return 'kept';
}

export interface KeptDay {
  lessons: KeptLesson[];
  /** Whose lessons the phone holds, or null before it has kept any. */
  owner: string | null;
  /** When they were read, for "as of 14:02". */
  at: string | null;
  /** Whether this day is one the copy covers: a day it does not cover is unknown, not empty. */
  covered: boolean;
}

/** One day's kept lessons, in the order they happen. */
export async function keptDay(day: LocalDate): Promise<KeptDay> {
  const db = keptStore();
  const [lessons, facts] = await Promise.all([db.lessons.where('day').equals(day).sortBy('startsAt'), db.facts.toArray()]);
  const fact = (key: KeptFact['key']) => facts.find((one) => one.key === key)?.value ?? null;
  return {
    lessons,
    owner: fact('owner'),
    at: fact('at'),
    covered: (fact('days') ?? '').split(',').includes(day),
  };
}

/** Takes the kept lessons off the phone, for whenever somebody lands on sign in. */
export async function forgetKeptDays(): Promise<void> {
  const db = keptStore();
  await db.transaction('rw', db.lessons, db.facts, async () => {
    await db.lessons.clear();
    await db.facts.clear();
  });
}
