import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { authFile } from '../support/accounts';
import { holdBooksBusiness, withDatabase } from '../support/database';
import { expectAccessible, settled, snap } from '../support/helpers';

/**
 * An instructor's books (MNY-02, MNY-03, MNY-04, D-198).
 *
 * The seeded instructor keeps these, so each run clears what it added rather than what was there.
 * The two widths run together, so each gets its own car and its own amounts.
 */
function ownFor(project: string): { make: string; model: string; car: string; plate: string; amount: string; pence: number; miles: string } {
  return project === 'mobile'
    ? { make: 'Vauxhall', model: 'Corsa', car: 'Vauxhall Corsa', plate: 'MO24 BIL', amount: '31.41', pence: 3141, miles: '12' }
    : { make: 'Toyota', model: 'Yaris', car: 'Toyota Yaris', plate: 'DE24 SKT', amount: '41.41', pence: 4141, miles: '24' };
}

/** The car the retiring test adds, which is its own so the others are left alone. */
function spareFor(project: string): string {
  return project === 'mobile' ? 'MO24 OLD' : 'DE24 OLD';
}

async function clearUp(project: string): Promise<void> {
  const { plate, pence } = ownFor(project);
  const spare = spareFor(project).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const registration = plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  await withDatabase(async (sql) => {
    await sql`delete from public.mileage_log where vehicle_id in (select id from public.vehicles where registration = ${registration})`;
    await sql`delete from public.expenses where amount_pence = ${pence}`;
    await sql`delete from public.vehicles where registration in (${registration}, ${spare})`;
  });
}

test.describe('bookkeeping (MNY-02, MNY-03, MNY-04, D-198)', () => {
  test.use({ storageState: authFile('instructor') });
  test.describe.configure({ mode: 'serial' });

  // eslint-disable-next-line no-empty-pattern
  test.beforeAll(async ({}, workerInfo) => { await clearUp(workerInfo.project.name); });
  // eslint-disable-next-line no-empty-pattern
  test.afterAll(async ({}, workerInfo) => { await clearUp(workerInfo.project.name); });

  test('is reached from More, and says it is in beta on every screen', async ({ page }, testInfo) => {
    await page.goto('/app/instructor/more');
    await page.getByRole('link', { name: 'Bookkeeping' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Bookkeeping' })).toBeVisible();

    // The marker is on the home screen and follows into every screen behind it.
    const beta = page.getByRole('note').filter({ hasText: 'Beta' });
    await expect(beta).toBeVisible();
    await expect(page.getByRole('region', { name: /tax year/ })).toBeVisible();
    await expectAccessible(page);
    await settled(page);
    await snap(page, testInfo, 'books-home');

    // Each screen is linked from here, and each one says the same thing at the top. Visited by
    // address rather than by going back and forth: the banner is sticky, and a row it happens to
    // be sitting over cannot be tapped until the page is scrolled.
    const screens = [
      ['Expenses', '/app/instructor/books/expenses'],
      ['Mileage', '/app/instructor/books/mileage'],
      ['Export', '/app/instructor/books/export'],
      ['Setup', '/app/instructor/books/setup'],
    ] as const;

    const books = page.getByRole('navigation', { name: 'Your books' });
    for (const [name, path] of screens) {
      await expect(books.getByRole('link', { name })).toHaveAttribute('href', path);
    }
    for (const [, path] of screens) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByRole('note').filter({ hasText: 'Beta' })).toBeVisible();
    }
  });

  test('adds a car, records what it cost, and counts it in the year', async ({ page }, testInfo) => {
    const own = ownFor(testInfo.project.name);

    await page.goto('/app/instructor/books/setup');
    await page.getByRole('button', { name: 'Add a car' }).click();
    await page.getByLabel('Make').fill(own.make);
    await page.getByLabel('Model (optional)').fill(own.model);
    await page.getByLabel('Year (optional)').fill('2020');
    await page.getByLabel('Registration (optional)').fill(own.plate);
    await page.getByRole('button', { name: 'Add it' }).click();
    await expect(page.getByText(own.car)).toBeVisible();
    await expect(page.getByRole('region', { name: 'Your cars' }).or(page.getByText('Not settled yet')).first()).toBeVisible();
    await expectAccessible(page);
    await settled(page);
    await snap(page, testInfo, 'books-setup');

    await page.goto('/app/instructor/books/expenses');
    await page.getByRole('button', { name: 'Add an expense' }).click();
    await page.getByLabel('What was it for?').selectOption('franchise_fee');
    await page.getByLabel('What did it cost?').fill(own.amount);
    await page.getByRole('button', { name: 'Record it' }).click();
    // The row for it, rather than the card's total, which is the same number while it is the only one.
    await expect(page.getByRole('list', { name: 'Expenses' }).getByRole('listitem').filter({ hasText: `£${own.amount}` })).toBeVisible();
    await expectAccessible(page);
    await settled(page);
    await snap(page, testInfo, 'books-expenses');

    // The year's figures pick it up, under the heading the return uses.
    await page.goto('/app/instructor/books');
    await expect(page.getByRole('region', { name: /as the return asks/ })).toContainText('Other business expenses');
  });

  test('a car claimed by the mile refuses its own running costs', async ({ page }, testInfo) => {
    const own = ownFor(testInfo.project.name);

    await page.goto('/app/instructor/books/mileage');
    await page.getByRole('button', { name: 'Log a trip' }).click();
    await page.getByLabel('Which car?').selectOption({ label: own.car });
    await page.getByLabel('How far?').fill(own.miles);
    await page.getByRole('button', { name: 'Log it' }).click();
    await expect(page.getByText(`${own.miles} miles`).first()).toBeVisible();
    await expectAccessible(page);
    await settled(page);
    await snap(page, testInfo, 'books-mileage');

    // That car is settled on the mileage rate now, so there is no car to claim fuel against and
    // the question is not asked at all.
    await page.goto('/app/instructor/books/expenses');
    await page.getByRole('button', { name: 'Add an expense' }).click();
    await page.getByLabel('What was it for?').selectOption('fuel');
    // Asked about this car rather than about the picker: the other width is running at the same
    // moment and has a car of its own, which may or may not be settled yet.
    await expect(page.getByRole('option', { name: own.car })).toHaveCount(0);
    // It is still offered for something that is not a running cost.
    await page.getByLabel('What was it for?').selectOption('training');
    await expect(page.getByRole('option', { name: own.car })).toHaveCount(1);
  });

  test('retires a car without taking its history with it', async ({ page }, testInfo) => {
    const spare = spareFor(testInfo.project.name);

    await page.goto('/app/instructor/books/setup');
    await page.getByRole('button', { name: 'Add a car' }).click();
    await page.getByLabel('Make').fill('Skoda');
    await page.getByLabel('Model (optional)').fill('Fabia');
    await page.getByLabel('Registration (optional)').fill(spare);
    await page.getByRole('button', { name: 'Add it' }).click();

    const cars = page.getByRole('list', { name: 'Your cars' });
    const row = cars.getByRole('listitem').filter({ hasText: spare });
    await expect(row).toBeVisible();

    // The same plate again is the same car, and is refused rather than doubled.
    await page.getByRole('button', { name: 'Add a car' }).click();
    await page.getByLabel('Make').fill('Skoda');
    await page.getByLabel('Registration (optional)').fill(spare.toLowerCase());
    await page.getByRole('button', { name: 'Add it' }).click();
    await expect(page.getByText('That registration is already one of your cars.')).toBeVisible();
    await page.keyboard.press('Escape');

    await row.getByRole('button', { name: /^Retire / }).click();
    await page.getByRole('button', { name: 'Retire it' }).click();
    await expect(row).toHaveCount(0);
  });

  test('exports a year and a quarter as a file an accountant can open', async ({ page }, testInfo) => {
    await page.goto('/app/instructor/books/export');
    await expect(page.getByRole('region', { name: /tax year/ })).toBeVisible();
    await expect(page.getByRole('region', { name: 'By quarter' }).getByRole('link', { name: 'CSV' })).toHaveCount(4);
    await expectAccessible(page);
    await settled(page);
    await snap(page, testInfo, 'books-export');

    const download = page.waitForEvent('download');
    await page.getByRole('link', { name: 'The whole year as a CSV' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.csv$/);

    const body = await file.createReadStream().then(async (stream) => {
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(chunk as Buffer);
      return Buffer.concat(chunks).toString('utf8');
    });
    expect(body, 'the file names the figures a return asks for').toContain('Your turnover');
    expect(body).toContain('Net profit');
    expect(body).toContain('Every expense');
  });

  test('asks whether the instructor charges VAT, and takes the number when they do', async ({ page }, testInfo) => {
    // One answer for the whole Business, and both widths are running: take turns.
    const letGo = await holdBooksBusiness();
    try {
      await runTheVatQuestion(page, testInfo);
    } finally {
      await letGo();
    }
  });
});

async function runTheVatQuestion(page: Page, testInfo: TestInfo): Promise<void> {
  {
    await page.goto('/app/instructor/books/setup');
    const vat = page.getByRole('region', { name: 'VAT' });
    const question = vat.getByRole('switch', { name: 'I am registered for VAT' });
    await expect(question).toBeVisible();

    await question.click();
    await vat.getByLabel('Your VAT number').fill('12345');
    await vat.getByRole('button', { name: 'Save VAT details' }).click();
    await expect(vat.getByText('That is not a UK VAT number')).toBeVisible();

    await vat.getByLabel('Your VAT number').fill('123456789');
    await vat.getByRole('button', { name: 'Save VAT details' }).click();
    await expect(page.getByText('Your figures now allow for VAT')).toBeVisible();
    await settled(page);
    await snap(page, testInfo, 'books-vat');

    // The year's figures say what the VAT did to them.
    await page.goto('/app/instructor/books');
    await expect(page.getByRole('region', { name: /tax year/ })).toContainText('registered for VAT');

    // Left as it was found, because nothing else expects this Business to charge VAT.
    await page.goto('/app/instructor/books/setup');
    await page.getByRole('switch', { name: 'I am registered for VAT' }).click();
    await expect(page.getByText('Your figures no longer allow for VAT')).toBeVisible();
  }
}

/** MNY-06 is Phase 2, so a school is told rather than shown (D-198). */
test.describe('bookkeeping for a school (MNY-06)', () => {
  test.use({ storageState: authFile('schoolOwner') });

  test('says it is coming soon', async ({ page }, testInfo) => {
    await page.goto('/app/school/more');
    await page.getByRole('link', { name: 'Bookkeeping' }).click();
    await expect(page.getByRole('heading', { name: 'Coming soon for schools' })).toBeVisible();
    await expectAccessible(page);
    await settled(page);
    await snap(page, testInfo, 'books-school');
  });
});
