import { expect, test } from '@playwright/test';
import { makeSchoolLearner } from '../support/database';
import { expectAccessible, snap } from '../support/helpers';
import { signInThroughForm } from '../support/sign-in';

/**
 * Getting started (LRN-02, D-183): the questions a learner is asked on their home screen once they
 * have signed up, each one skippable, and all of them on their Account afterwards. A learner of
 * this test's own at each width, since the answers are what the test is about.
 */
test.describe('a learner is asked a few things to start with (LRN-02, D-183)', () => {
  test('answers what they want to, skips the rest, and finds it all on their account', async ({ page }, testInfo) => {
    // A postcode the seed has looked up already, and a gearbox, which is one question answered.
    const learner = await makeSchoolLearner(`Priya ${testInfo.project.name}`, { postcode: 'LS6 3QS', transmission: 'manual' });
    try {
      await signInThroughForm(page, learner.email);
      await page.goto('/app/learner');

      const card = page.getByRole('region', { name: 'Finish setting up' });
      await expect(card).toContainText('1 of 5 done');
      await expect(card.getByText('Where do your lessons start?')).toBeVisible();
      await expectAccessible(page);
      await snap(page, testInfo, 'learner-setup');

      // Where they are collected can wait, and skipping moves on to the next question.
      await card.getByRole('button', { name: 'Skip' }).click();
      await expect(page.getByText('Skipped. Pickup point is on your Account whenever you want it.')).toBeVisible();
      await expect(card.getByLabel('Do you have a disability, condition or learning difficulty?')).toBeVisible();

      await card.getByLabel('Do you have a disability, condition or learning difficulty?').selectOption({ label: 'No' });
      await card.getByRole('button', { name: 'Save' }).click();
      await expect(card).toContainText('2 of 5 done');

      // Medication asks what it is before it takes a yes, since a yes alone says nothing useful.
      await card.getByLabel('Are you taking any medication?').selectOption({ label: 'Yes' });
      await card.getByRole('button', { name: 'Save' }).click();
      await expect(card.getByText('Say what it is, so your instructor knows what to watch for')).toBeVisible();
      await card.getByLabel('What is it, and how does it affect you?').fill('Hay fever tablets that can make me drowsy');
      await card.getByRole('button', { name: 'Save' }).click();
      await expect(card).toContainText('3 of 5 done');

      // The last question, and then there is nothing left to ask.
      await card.getByLabel('Have you passed your theory test?').selectOption({ label: 'Yes, passed within the last 2 years' });
      await card.getByRole('button', { name: 'Save' }).click();
      await expect(card).toHaveCount(0);

      // All of it is on their account, including the one they skipped.
      await page.goto('/app/learner/account/about-you');
      await expect(page.getByLabel('Have you passed your theory test?')).toHaveValue('passed');
      await expect(page.getByLabel('Which gearbox do you want to learn in?')).toHaveValue('manual');
      await expect(page.getByLabel('Are you taking any medication that could affect your driving?')).toHaveValue('yes');
      await expect(page.getByLabel('What is it, and how does it affect you?')).toHaveValue('Hay fever tablets that can make me drowsy');
      await expectAccessible(page);
    } finally {
      await learner.remove();
    }
  });
});

