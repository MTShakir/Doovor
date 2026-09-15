import { isSkillCode, isSkillRating, type SkillCode, type SkillRating } from '@repo/core/skills';

/**
 * A lesson's record while it is being written, kept on the phone (PRG-01, PRG-09, M4-04, M4-05).
 *
 * The timer, the skills tapped during the lesson and whatever has been typed so far survive a
 * reload, a locked screen and a car park with no signal. The record's id is made here, once, when
 * the draft is started, so however often the finished record is sent it is saved once (D-100).
 * Browser storage can be missing or refuse (a private window), so every use is guarded and the
 * screen works without it, for as long as it stays open.
 */

export interface LessonDraft {
  recordId: string;
  /** When "Start lesson" was pressed, for the timer. */
  startedAt: string | null;
  /** Tapped during the lesson or on the record, in the order they were tapped. */
  skills: SkillCode[];
  ratings: Partial<Record<SkillCode, SkillRating>>;
  summary: string;
  nextFocus: string;
  homework: string;
  /** When the record form was opened, for how long it took (PRG-01). */
  formOpenedAt: string | null;
}

const prefix = 'lesson-draft:';
const listeners = new Set<() => void>();
/** Drafts for the time storage refuses them, so the screen still works while it stays open. */
const memory = new Map<string, string>();

function storageKey(bookingId: string): string {
  return `${prefix}${bookingId}`;
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** For useSyncExternalStore: a change made here, or in another tab. */
export function subscribeToDrafts(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

/** The stored draft as text, which is stable between reads, as useSyncExternalStore needs. */
export function draftSnapshot(bookingId: string): string | null {
  try {
    return window.localStorage.getItem(storageKey(bookingId)) ?? memory.get(bookingId) ?? null;
  } catch {
    return memory.get(bookingId) ?? null;
  }
}

/** A draft read back, keeping only what is still valid: a skill removed from the map is dropped. */
export function parseDraft(text: string | null): LessonDraft | null {
  if (text === null) return null;
  try {
    const value = JSON.parse(text) as Partial<LessonDraft>;
    if (typeof value.recordId !== 'string') return null;
    const skills = Array.isArray(value.skills) ? value.skills.filter(isSkillCode) : [];
    const ratings: Partial<Record<SkillCode, SkillRating>> = {};
    for (const [code, rating] of Object.entries(value.ratings ?? {})) {
      if (isSkillCode(code) && isSkillRating(rating)) ratings[code] = rating;
    }
    return {
      recordId: value.recordId,
      startedAt: typeof value.startedAt === 'string' ? value.startedAt : null,
      skills,
      ratings,
      summary: typeof value.summary === 'string' ? value.summary : '',
      nextFocus: typeof value.nextFocus === 'string' ? value.nextFocus : '',
      homework: typeof value.homework === 'string' ? value.homework : '',
      formOpenedAt: typeof value.formOpenedAt === 'string' ? value.formOpenedAt : null,
    };
  } catch {
    return null;
  }
}

export function newDraft(): LessonDraft {
  return {
    recordId: crypto.randomUUID(),
    startedAt: null,
    skills: [],
    ratings: {},
    summary: '',
    nextFocus: '',
    homework: '',
    formOpenedAt: null,
  };
}

export function saveDraft(bookingId: string, draft: LessonDraft): void {
  const text = JSON.stringify(draft);
  memory.set(bookingId, text);
  try {
    window.localStorage.setItem(storageKey(bookingId), text);
  } catch {
    // Kept in memory instead, for as long as the page stays open.
  }
  notify();
}

/** Once the record is saved, there is nothing left to keep. */
export function clearDraft(bookingId: string): void {
  memory.delete(bookingId);
  try {
    window.localStorage.removeItem(storageKey(bookingId));
  } catch {
    // Nothing was stored.
  }
  notify();
}
