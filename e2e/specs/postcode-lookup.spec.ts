import { expect, test } from '@playwright/test';
import { authFile } from '../support/accounts';

/**
 * The postcode lookup route (COV-03, M1-05). Only the answers that need no upstream service
 * are checked here, so the suite never depends on postcodes.io being reachable.
 */
test.describe('postcode lookup (COV-03)', { tag: '@desktop-only' }, () => {
  test('is closed to people who are not signed in', async ({ request }) => {
    const response = await request.get('/api/geo/postcode?postcode=LS6%203HN');

    expect(response.status()).toBe(401);
    expect(await response.json()).toMatchObject({ ok: false, code: 'NOT_AUTHENTICATED' });
    expect(response.headers()['cache-control']).toContain('no-store');
  });

  test.describe('signed in', () => {
    test.use({ storageState: authFile('instructor') });

    test('rejects something that is not a postcode, and says what one looks like', async ({ request }) => {
      for (const value of ['', 'Leeds', 'LS6', '90210']) {
        const response = await request.get(`/api/geo/postcode?postcode=${encodeURIComponent(value)}`);

        expect(response.status()).toBe(400);
        expect(await response.json()).toMatchObject({
          ok: false,
          code: 'VALIDATION_FAILED',
          message: 'Enter a UK postcode like LS1 4DY',
        });
      }
    });
  });
});
