import { expect, test, type Page } from '@playwright/test';
import { authFile, type RoleKey } from '../support/accounts';
import { expectAccessible, settled } from '../support/helpers';
import { portals, publicPages } from '../support/screens';

/**
 * Every screen, scanned and driven from the keyboard (M6-06, PRD 14.4, NFR-A11Y).
 *
 * The flows elsewhere scan the screens they visit, and each one in a state a person put it in,
 * which catches more than this. This sweep catches the rest: a screen no flow opens, and the three
 * things a flow never checks, which are whether text at twice the size still fits, whether the
 * keyboard can get past the navigation, and whether every stop it makes can be seen.
 */

/**
 * Widens the text to 200%, the way a browser's own text zoom does (WCAG 1.4.4). Set before the
 * page is opened, so it survives a screen that sends the browser somewhere else as it loads.
 */
async function textAtDoubleSize(page: Page): Promise<void> {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = 'html { font-size: 200% !important; }';
      document.head.append(style);
    });
  });
}

/** What the page would need scrolled sideways to read, if anything. */
async function sidewaysOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const root = document.documentElement;
    return Math.max(0, Math.max(root.scrollWidth, document.body.scrollWidth) - root.clientWidth);
  });
}

test.describe('every screen passes the scan (M6-06)', () => {
  test('the public pages', async ({ page }) => {
    for (const path of publicPages) {
      await page.goto(path);
      await expectAccessible(page);
    }
  });

  for (const [role, paths] of portals) {
    test(`the ${role} screens`, async ({ browser }) => {
      const context = await browser.newContext({ storageState: authFile(role) });
      try {
        const page = await context.newPage();
        for (const path of paths) {
          await page.goto(path);
          await expectAccessible(page);
        }
      } finally {
        await context.close();
      }
    });
  }
});

test.describe('text at twice the size (WCAG 1.4.4, M6-06)', () => {
  /** Nothing may have to be scrolled sideways to read, and the screen still says what it is. */
  /** Every screen, and every one that does not fit, rather than only the first. */
  async function allFit(page: Page, paths: string[]): Promise<void> {
    await textAtDoubleSize(page);
    const sideways: string[] = [];
    for (const path of paths) {
      await page.goto(path);
      // The screen still says what it is, rather than having pushed its own heading away, and it
      // has finished arriving before anything is measured.
      await expect(page.getByRole('heading').first(), `${path} has pushed its own heading away`).toBeVisible();
      await settled(page);
      // A pixel of rounding is not a page somebody has to scroll sideways to read.
      const over = await sidewaysOverflow(page);
      if (over > 1) sideways.push(`${path} by ${String(Math.round(over))}px`);
    }
    expect(sideways, 'these need scrolling sideways at 200% text').toEqual([]);
  }

  test('the public pages', async ({ page }) => {
    await allFit(page, publicPages);
  });

  for (const [role, paths] of portals) {
    test(`the ${role} screens`, async ({ browser }) => {
      const context = await browser.newContext({ storageState: authFile(role) });
      try {
        await allFit(await context.newPage(), paths);
      } finally {
        await context.close();
      }
    });
  }
});

test.describe('the keyboard alone (WCAG 2.1.1, 2.4.1, 2.4.7, M6-06)', () => {
  test('the public site can be got past its navigation', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const first = page.getByRole('link', { name: 'Skip to content' });
    await expect(first).toBeFocused();
    await expect(first, 'the skip link shows itself once it has the keyboard').toBeVisible();
    await first.press('Enter');
    // Focus moves, so the next press carries on inside the page rather than back at the top.
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('content');
  });

  test('a portal can be got past its navigation', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFile('instructor') });
    try {
      const page = await context.newPage();
      await page.goto('/app/instructor');
      await page.keyboard.press('Tab');
      const first = page.getByRole('link', { name: 'Skip to content' });
      await expect(first).toBeFocused();
      await first.press('Enter');
      expect(await page.evaluate(() => document.activeElement?.id)).toBe('content');
    } finally {
      await context.close();
    }
  });

  /**
   * Tabbing through a screen: every stop is on screen, is big enough to hit, and shows that it has
   * the keyboard. A stop nobody can see is a trap for anybody who is not using a mouse.
   */
  const screens: [RoleKey | null, string][] = [
    [null, '/'],
    [null, '/book/sarah-khan'],
    [null, '/sign-in'],
    ['instructor', '/app/instructor'],
    ['instructor', '/app/instructor/diary'],
    ['learner', '/app/learner'],
    ['schoolOwner', '/app/school'],
    ['admin', '/admin'],
  ];

  for (const [role, path] of screens) {
    // The admin portal asks for a larger screen on a phone (PRD 8.2), so there is nothing to walk.
    const only = path.startsWith('/admin') ? ' @desktop-only' : '';
    test(`${path} can be walked through${only}`, async ({ browser }) => {
      const context = await browser.newContext(role === null ? {} : { storageState: authFile(role) });
      try {
        const page = await context.newPage();
        await page.goto(path);
        await expect(page.getByRole('heading').first(), `${path} has not arrived`).toBeVisible();
        await settled(page);

        const seen: string[] = [];
        const hidden: string[] = [];
        const unmarked: string[] = [];
        for (let step = 0; step < 40; step += 1) {
          await page.keyboard.press('Tab');
          const stop = await page.evaluate(() => {
            const element = document.activeElement;
            if (!element || element === document.body) return null;
            // A date field is four stops in one: day, month, year, and the browser's own calendar
            // button. Focus stays on the same element and the browser draws the last one itself, so
            // only the press that first reaches a control is held to showing it.
            const store = window as unknown as { lastStop?: Element };
            const again = store.lastStop === element;
            store.lastStop = element;
            const box = element.getBoundingClientRect();
            const styles = window.getComputedStyle(element);
            const outline = styles.outlineStyle !== 'none' && parseFloat(styles.outlineWidth) > 0;
            const ring = styles.boxShadow !== 'none';
            const label = element.getAttribute('aria-label');
            const words = element.textContent.trim().slice(0, 40);
            return {
              // Enough to tell one stop from the next, and to name it in a failure.
              what: `${element.tagName.toLowerCase()}${label === null ? '' : `[${label}]`}: ${words}`,
              onScreen: box.width > 0 && box.height > 0,
              marked: outline || ring || again,
            };
          });
          // Focus leaving the page for the browser's own chrome ends the walk.
          if (stop === null) break;
          seen.push(stop.what);
          if (!stop.onScreen) hidden.push(stop.what);
          if (!stop.marked) unmarked.push(stop.what);
          if (seen.length > 1 && stop.what === seen[0]) break;
        }

        expect(seen.length, `${path} has nothing to tab to`).toBeGreaterThan(2);
        expect(hidden, `${path} gives the keyboard to something nobody can see`).toEqual([]);
        expect(unmarked, `${path} gives the keyboard to something that does not show it`).toEqual([]);
      } finally {
        await context.close();
      }
    });
  }
});
