import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo } from '@playwright/test';

const MILESTONE = process.env.E2E_MILESTONE ?? 'm2';

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

/** WCAG 2.2 AA scan. Fails on serious or critical issues (PRD 14.4, M6-06). */
export async function expectAccessible(page: Page, options: { exclude?: string[] } = {}): Promise<void> {
  await settled(page);
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']);
  for (const selector of options.exclude ?? []) builder = builder.exclude(selector);
  const results = await builder.analyze();
  const blocking = results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${String(v.impact)}): ${v.help} -> ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  expect(blocking, 'serious or critical accessibility issues').toEqual([]);
}
