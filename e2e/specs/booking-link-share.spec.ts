import { expect, test, type Page } from '@playwright/test';
import jsQR from 'jsqr';
import { authFile } from '../support/accounts';
import { expectAccessible, settled, snap } from '../support/helpers';

/** Draws the QR code the page shows onto a canvas, as a camera would see it, and reads it. */
async function scanQr(page: Page): Promise<string | null> {
  const drawn = await page.getByRole('img', { name: 'QR code for your booking link' }).evaluate(async (svg) => {
    const size = 400;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('width', String(size));
    clone.setAttribute('height', String(size));
    // The page colours it through the theme; a file on its own needs the colours written in.
    clone.querySelector('rect')?.setAttribute('fill', 'white');
    clone.querySelector('path')?.setAttribute('fill', 'black');
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.fillStyle = 'white';
    context.fillRect(0, 0, size, size);
    context.drawImage(image, 0, 0, size, size);
    return Array.from(context.getImageData(0, 0, size, size).data);
  });
  if (drawn === null) return null;
  return jsQR(Uint8ClampedArray.from(drawn), 400, 400)?.data ?? null;
}

/**
 * Sharing the booking link (PUB-03, M5-05). Sarah Khan is approved and shares hers; Aisha Rahman
 * is still waiting to be checked.
 */
test.describe('sharing the booking link (PUB-03, M5-05)', () => {
  test.describe('an approved instructor', () => {
    test.use({ storageState: authFile('instructor') });

    test('copies the link, sends it on WhatsApp, and prints a QR code that scans to it', async ({ page, context }, testInfo) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.goto('/app/instructor/profile');
      const card = page.getByRole('region', { name: 'Your booking link' });
      const link = new URL('/book/sarah-khan', page.url()).toString();
      await expect(card.getByLabel('Link', { exact: true })).toHaveValue(link);

      await expect(async () => {
        await card.getByRole('button', { name: 'Copy link' }).click();
        await expect(page.getByText('Link copied', { exact: true })).toBeVisible({ timeout: 2000 });
      }).toPass({ timeout: 15_000 });
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);

      const whatsApp = new URL((await card.getByRole('link', { name: 'WhatsApp' }).getAttribute('href')) ?? '');
      expect(whatsApp.origin).toBe('https://wa.me');
      expect(whatsApp.searchParams.get('text')).toBe(`Book a driving lesson with Sarah Khan: ${link}`);

      // PUB-03 done-when: the QR code scans to the booking link.
      expect(await scanQr(page)).toBe(link);
      const download = card.getByRole('link', { name: 'Download QR code' });
      await expect(download).toHaveAttribute('download', 'booking-link-qr-code.svg');
      await expect(download).toHaveAttribute('href', /^data:image\/svg\+xml/);

      await expect(card.getByRole('link', { name: 'See your public profile' })).toHaveAttribute('href', /\/instructors\/leeds\/sarah-khan$/);
      await expectAccessible(page);
      await settled(page);
      await snap(page, testInfo, 'booking-link-share');
    });
  });

  test.describe('a learner opening the link', () => {
    test('sees the tick, and can read the full profile first', async ({ page }, testInfo) => {
      await page.goto('/book/sarah-khan');
      await expect(page).toHaveTitle(/^Book a lesson with Sarah Khan \| /);
      await expect(page.getByRole('link', { name: 'See the full profile' })).toHaveAttribute('href', /\/instructors\/leeds\/sarah-khan$/);
      await expect(page.getByRole('group', { name: /^Times on/ }).or(page.getByText(/^Nothing free on/))).toBeVisible();
      await expectAccessible(page);
      await settled(page);
      await snap(page, testInfo, 'booking-link-polished');
    });
  });

  test.describe('an instructor still being checked', () => {
    test.use({ storageState: authFile('trainee') });

    test('is told the link is ready as soon as the badge is approved', async ({ page }) => {
      await page.goto('/app/instructor/profile');
      await expect(page.getByText('Ready as soon as your badge is approved.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Copy link' })).toHaveCount(0);
      await expect(page.getByRole('img', { name: 'QR code for your booking link' })).toHaveCount(0);
    });
  });
});
