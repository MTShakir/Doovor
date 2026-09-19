import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const capture = vi.fn();
const identify = vi.fn();
const reset = vi.fn();
let consent: 'accepted' | 'declined' | null | 'unknown' = 'accepted';

vi.mock('./consent', () => ({ consentSnapshot: () => consent }));
vi.mock('./posthog', () => ({ startCounting: () => Promise.resolve({ capture, identify, reset }) }));

const { track, trackWho, trackNobody, countedEvent } = await import('./track.ts');

/** The page the browser code talks to. */
function pretendThereIsAWindow(): { said: { event: string; properties: unknown }[] } {
  const said: { event: string; properties: unknown }[] = [];
  vi.stubGlobal('window', {
    dispatchEvent: (event: CustomEvent<{ event: string; properties: unknown }>) => {
      said.push(event.detail);
      return true;
    },
  });
  vi.stubGlobal('CustomEvent', class {
    detail: unknown;
    constructor(
      public type: string,
      options: { detail: unknown },
    ) {
      this.detail = options.detail;
    }
  });
  return { said };
}

describe('counting what happened (PRD 16, M6-09)', () => {
  beforeEach(() => {
    capture.mockClear();
    identify.mockClear();
    reset.mockClear();
    consent = 'accepted';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the name and what goes with it', async () => {
    const { said } = pretendThereIsAWindow();
    track('booking_created', { source: 'self', recurring: false });
    await vi.waitFor(() => {
      expect(capture).toHaveBeenCalledWith('booking_created', { source: 'self', recurring: false });
    });
    expect(said).toEqual([{ event: 'booking_created', properties: { source: 'self', recurring: false } }]);
  });

  it('sends an event that carries nothing at all', async () => {
    pretendThereIsAWindow();
    track('lesson_completed');
    await vi.waitFor(() => {
      expect(capture).toHaveBeenCalledWith('lesson_completed', undefined);
    });
  });

  it('counts nothing at all for somebody who has not said yes', async () => {
    const { said } = pretendThereIsAWindow();
    for (const answer of ['declined', null, 'unknown'] as const) {
      consent = answer;
      track('profile_viewed', { kind: 'instructor' });
      trackWho('who');
      trackNobody();
    }
    // Long enough for anything queued to have run.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(capture).not.toHaveBeenCalled();
    expect(identify).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
    expect(said).toEqual([]);
  });

  it('says who somebody is by their account and nothing else, and forgets them again', async () => {
    pretendThereIsAWindow();
    trackWho('11111111-2222-3333-4444-555555555555');
    await vi.waitFor(() => {
      expect(identify).toHaveBeenCalledWith('11111111-2222-3333-4444-555555555555');
    });
    trackNobody();
    await vi.waitFor(() => {
      expect(reset).toHaveBeenCalled();
    });
  });

  it('names the event a page can listen for', () => {
    expect(countedEvent).toBe('counted');
  });
});
