import type PostHogLibrary from 'posthog-js';
import { clientEnv } from '@/env/client';

/**
 * The counting itself (PRD 16, M6-08, M6-09).
 *
 * The library is fetched the first time somebody says yes, and never before: an import at the top
 * of a module would put it in the page whatever the answer was, and the point is that a person who
 * has not agreed sends nothing anywhere.
 */
type PostHog = typeof PostHogLibrary;

let counting: Promise<PostHog | null> | null = null;
let started = false;

async function load(): Promise<PostHog | null> {
  const key = clientEnv.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key || typeof window === 'undefined') return null;
  const { default: posthog } = await import('posthog-js');
  posthog.init(key, {
    api_host: clientEnv.NEXT_PUBLIC_POSTHOG_HOST,
    // Nobody gets a profile until they are somebody: a visitor reading a profile page is a count,
    // not a person (NFR-PRV-02).
    person_profiles: 'identified_only',
    // Sent by us, when the address changes, so a screen kept for no signal is not counted twice.
    capture_pageview: false,
    capture_pageleave: true,
    // Nothing is recorded of what somebody types or sees.
    disable_session_recording: true,
    autocapture: false,
    persistence: 'localStorage',
    // We count; we do not ask it what to switch on. Without this it asks on every page load for
    // feature flags nothing reads, and holds what it is counting until the answer comes back.
    advanced_disable_flags: true,
    advanced_disable_feature_flags: true,
  });
  return posthog;
}

/** Starts counting, loading the library if this is the first yes. */
export async function startCounting(): Promise<PostHog | null> {
  counting ??= load();
  const posthog = await counting;
  if (posthog && !started) {
    started = true;
    posthog.opt_in_capturing();
  }
  return posthog;
}

/** Stops, and forgets what was kept on this device. */
export async function stopCounting(): Promise<void> {
  if (counting === null) return;
  const posthog = await counting;
  if (posthog === null) return;
  started = false;
  posthog.opt_out_capturing();
  posthog.reset();
}

/** The counter, but only if somebody has already said yes. Never loads the library itself. */
export async function countingNow(): Promise<PostHog | null> {
  if (counting === null || !started) return null;
  return counting;
}
