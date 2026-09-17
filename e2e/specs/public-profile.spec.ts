import { expect, test } from '@playwright/test';
import { expectAccessible, settled, snap } from '../support/helpers';

/**
 * The public instructor profile (PRD 8.3, PUB-01, INS-05, M5-02), read by somebody with no
 * account. Other tests change Sarah Khan's bio and diary while these run, so these read what they
 * leave alone: who she is, where she teaches, her prices, and that a free time opens the booking
 * link with that time chosen.
 */
test.describe('public instructor profile (PUB-01, M5-02)', () => {
  test('a visitor reads a checked instructor, nothing private, and books from a free time', async ({ page }, testInfo) => {
    await page.goto('/instructors/leeds/sarah-khan');
    await expect(page.getByRole('heading', { level: 1, name: 'Sarah Khan' })).toBeVisible();
    await expect(page.getByText('Approved driving instructor, checked by us')).toBeVisible();
    await expect(page.getByRole('list', { name: 'At a glance' })).toContainText('Manual');
    await expect(page.getByRole('region', { name: 'Where lessons start' })).toContainText(/Lessons within \d+ miles? of LS6/);
    await expect(page.getByRole('region', { name: 'Prices' }).getByRole('listitem').first()).toContainText(/£\d+/);
    await expect(page).toHaveTitle(/^Sarah Khan, driving instructor in Leeds \| /);

    // Nothing private anywhere in the page: not her home postcode, not her badge number.
    const html = await page.content();
    expect(html).not.toContain('LS6 3QS');
    expect(html).not.toContain('416234');

    // Search engines read who she is and what she charges (PUB-02, M5-04).
    const structured = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}') as {
      '@graph': { '@type': string; name?: string; offers?: { price: string; priceCurrency: string }[] }[];
    };
    expect(structured['@graph'].map((node) => node['@type'])).toEqual(['Person', 'Service', 'BreadcrumbList']);
    expect(structured['@graph'][0]?.name).toBe('Sarah Khan');
    expect(structured['@graph'][1]?.offers?.[0]).toMatchObject({ priceCurrency: 'GBP', price: expect.stringMatching(/^\d+\.\d\d$/) });

    const times = page.getByRole('region', { name: 'Next free times' }).getByRole('listitem').getByRole('link');
    await expect(times.first()).toBeVisible();
    expect(await times.count()).toBeLessThanOrEqual(3);
    await expectAccessible(page);
    await settled(page);
    await snap(page, testInfo, 'public-profile');

    // A free time opens the booking link with that time already chosen.
    const first = times.first();
    const chosenAt = new URL((await first.getAttribute('href')) ?? '', page.url()).searchParams.get('slot') ?? '';
    const clock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }).format(new Date(chosenAt));
    await first.click();
    await expect(page).toHaveURL(/\/book\/sarah-khan\?slot=/);
    await expect(page.getByRole('button', { name: clock, pressed: true })).toBeVisible();
  });

  test('one address per profile: another city moves to the right one, and nobody unchecked has one', async ({ page }) => {
    await page.goto('/instructors/manchester/sarah-khan');
    await expect(page).toHaveURL(/\/instructors\/leeds\/sarah-khan$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Sarah Khan' })).toBeVisible();

    await page.goto('/instructors/leeds/nobody-teaches-here');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();

    // Aisha Rahman is still waiting to be checked (INS-05).
    await page.goto('/instructors/manchester/aisha-rahman');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  });

  test('an instructor at a school says which school', async ({ page }, testInfo) => {
    await page.goto('/instructors/manchester/emma-clarke');
    await expect(page.getByRole('heading', { level: 1, name: 'Emma Clarke' })).toBeVisible();
    await expect(page.getByText('Teaches with Quayside Driving School')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Quayside Driving School' })).toHaveAttribute('href', '/schools/manchester/quayside-driving-school');
    await expect(page.getByRole('list', { name: 'At a glance' })).toContainText('Automatic');
    await expectAccessible(page);
    await settled(page);
    await snap(page, testInfo, 'public-profile-school');
  });
});

/**
 * The public school profile (PUB-01, M5-03). Quayside Driving School has three instructors:
 * Emma Clarke and Tom Walsh are approved; Aisha Rahman is still waiting to be checked.
 */
test.describe('public school profile (PUB-01, M5-03)', () => {
  test('a school lists the instructors a learner can find, each opening their own profile', async ({ page }, testInfo) => {
    await page.goto('/schools/manchester/quayside-driving-school');
    await expect(page.getByRole('heading', { level: 1, name: 'Quayside Driving School' })).toBeVisible();
    await expect(page.getByText(/^Driving school in Manchester, \d+ instructors taking learners$/)).toBeVisible();
    const instructors = page.getByRole('region', { name: 'Instructors' });
    await expect(instructors.getByRole('link', { name: /^Emma Clarke/ })).toBeVisible();
    await expect(instructors.getByRole('link', { name: /^Tom Walsh/ })).toBeVisible();
    await expect(instructors.getByRole('link', { name: /Aisha Rahman/ })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Prices' })).toBeVisible();
    const structured = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}') as {
      '@graph': { '@type': string | string[]; employee?: { name: string }[] }[];
    };
    expect(structured['@graph'][0]?.['@type']).toEqual(['LocalBusiness', 'EducationalOrganization']);
    expect(structured['@graph'][0]?.employee?.map((person) => person.name)).toEqual(expect.arrayContaining(['Emma Clarke', 'Tom Walsh']));
    await expectAccessible(page);
    await settled(page);
    await snap(page, testInfo, 'public-school');

    await instructors.getByRole('link', { name: /^Emma Clarke/ }).click();
    await expect(page).toHaveURL(/\/instructors\/manchester\/emma-clarke$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Emma Clarke' })).toBeVisible();
  });

  test('one address per school, and a Business of one has no school page', async ({ page }) => {
    await page.goto('/schools/leeds/quayside-driving-school');
    await expect(page).toHaveURL(/\/schools\/manchester\/quayside-driving-school$/);

    // Sarah Khan runs a Business of one: her page is her instructor profile.
    await page.goto('/schools/leeds/sarah-khan-driving');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  });
});
