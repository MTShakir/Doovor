import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

const MILESTONE = process.env.E2E_MILESTONE ?? 'm4';

/** Where a named screenshot lives: e2e/screenshots/<milestone>/<viewport>/<name>.png */
export function snapPath(testInfo: TestInfo, name: string): string {
  return path.join(import.meta.dirname, '..', 'screenshots', MILESTONE, testInfo.project.name, `${name}.png`);
}

/**
 * Screenshot saved per milestone and viewport for the milestone report. Full page by
 * default; use `fullPage: false` when fixed elements such as sheets are open.
 */
export async function snap(page: Page, testInfo: TestInfo, name: string, options: { fullPage?: boolean } = {}): Promise<void> {
  await page.screenshot({ path: snapPath(testInfo, name), fullPage: options.fullPage ?? true });
}

/**
 * Waits until nothing on the page is still moving or changing colour. A colour scanned in the
 * middle of a 200 ms transition is neither the colour it was nor the colour it will be, and a
 * contrast check on it fails at random.
 */
export async function settled(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      document.getAnimations().every((animation) => {
        // A skeleton pulses for as long as it is on screen; only one-off changes are waited for.
        const repeats = animation.effect?.getTiming().iterations ?? 1;
        return repeats === Infinity || animation.playState !== 'running';
      }),
    null,
    { timeout: 5000 },
  );
}

/**
 * Taps a control that does nothing until the page is interactive, and keeps tapping until it
 * does something. A button whose only job is to open a sheet has no disabled state to wait on
 * the way a form does (D-043), so the proof that it worked is what it opened.
 */
export async function tapUntil(control: Locator, appears: Locator): Promise<void> {
  await expect(async () => {
    await control.click();
    await expect(appears).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
}

/**
 * Taps a link or button that leads to another address, until the page is there. A tap before the
 * page is interactive does nothing (D-043), so it is tapped again. A tap already on its way, as
 * under a full run's load, is waited for rather than tapped again: once the new page is there,
 * what was tapped has gone, and a second tap would wait for it until the time ran out.
 */
export async function tapThrough(control: Locator, url: RegExp): Promise<void> {
  const page = control.page();
  await expect(async () => {
    if (!url.test(page.url())) await control.click({ timeout: 5000 });
    await page.waitForURL(url, { timeout: 5000 });
  }).toPass({ timeout: 30_000 });
}

/**
 * Types into a field that a component controls, until the value sticks. A value set before
 * the page is interactive is overwritten by the first render that follows it (D-043).
 */
export async function fillUntil(field: Locator, value: string): Promise<void> {
  await expect(async () => {
    await field.fill(value);
    await expect(field).toHaveValue(value, { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
}

/**
 * Picks a date in a date field that a component is listening to.
 *
 * Typing it in cannot work everywhere: the order of the day, month and year boxes comes from
 * the machine the browser runs on, not from the page's locale, so the same keystrokes make
 * 3 November here and nonsense on a Linux runner. Playwright's fill does not work either: it
 * sets the value through the element's own property, which React has replaced with one that
 * remembers the value, so the input event after it looks like no change at all. The setter on
 * the prototype goes around that, and the events that follow are ones React believes. The
 * loop is for a page that is not interactive yet, whose first render puts the old value back
 * (D-043).
 */
export async function chooseDate(field: Locator, value: string): Promise<void> {
  await expect(async () => {
    await field.evaluate((input, next) => {
      const element = input as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(element, next);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
    await expect(field).toHaveValue(value, { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
}

/**
 * WCAG 2.2 AA scan. Fails on serious or critical issues (PRD 14.4, M6-06).
 *
 * Colours are measured at rest. Waiting for movement to stop is not enough on its own: a toast can
 * start fading out after the wait and while the scan runs. So the scan runs with reduced motion,
 * which the app and its toasts honour by changing at once.
 */
export async function expectAccessible(page: Page, options: { exclude?: string[] } = {}): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  try {
    await settled(page);
    let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']);
    for (const selector of options.exclude ?? []) builder = builder.exclude(selector);
    const results = await builder.analyze();
    const blocking = results.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id} (${String(v.impact)}): ${v.help} -> ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
    expect(blocking, 'serious or critical accessibility issues').toEqual([]);
  } finally {
    await page.emulateMedia({ reducedMotion: null });
  }
}

/** A local day moved on or back by whole days: calendar arithmetic, with no zone to cross. */
export function addDays(date: string, days: number): string {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/**
 * The next day of the week after today in London, 1 to 7 days ahead (0 is Sunday): inside the
 * fortnight the seed fills, and never today. The seed is anchored to the day it ran, so a date
 * written into a test goes stale, and one that happens to be today is no day to move away from.
 */
export function nextWeekday(weekday: number, now = new Date()): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(now);
  let day = addDays(today, 1);
  while (new Date(`${day}T12:00:00Z`).getUTCDay() !== weekday) day = addDays(day, 1);
  return day;
}

/** A local day in British words, with the parts asked for: "Tuesday 22 September", "September 2026". */
export function dayWords(date: string, parts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-GB', { ...parts, timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
}

/**
 * The day as the app writes it: Wed 14 Oct. The browser abbreviates September to Sept and the
 * library the app formats with writes Sep, so the month is cut to three letters here.
 */
export function dayLabel(date: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/London',
  }).formatToParts(new Date(`${date}T12:00:00Z`));
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((one) => one.type === type)?.value ?? '';
  return `${part('weekday')} ${part('day')} ${part('month').slice(0, 3)}`;
}
