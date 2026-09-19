'use client';

import type { AnalyticsEvent, AnalyticsEvents } from '@repo/core/analytics';
import { useEffect, useRef } from 'react';
import { track } from '@/lib/analytics/track';

/**
 * Counts something a screen being shown tells us (PRD 16, M6-09): a profile read, a search
 * answered, a step of onboarding behind somebody.
 *
 * Once for each thing, however many times React renders it, and nothing at all for somebody who
 * has not said yes to being counted.
 */
export function Counted<E extends AnalyticsEvent>({
  event,
  properties,
  once,
}: {
  event: E;
  properties: AnalyticsEvents[E];
  /** What makes this one different from the last. Counting again needs a different value. */
  once: string;
}) {
  const counted = useRef<string | null>(null);

  useEffect(() => {
    if (counted.current === once) return;
    counted.current = once;
    // The properties are read here rather than watched: the thing being counted is `once`.
    // `track` takes them as a tuple, which is what makes an event with none take no argument.
    (track as (name: E, properties: AnalyticsEvents[E]) => void)(event, properties);
  }, [event, once, properties]);

  return null;
}
