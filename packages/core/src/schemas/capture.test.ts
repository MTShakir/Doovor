import { describe, expect, it } from 'vitest';
import {
  captureConfirmationWords,
  lessonRequestConsent,
  lessonRequestSchema,
  regionOpenedWords,
  waitingListConsent,
  waitingListSchema,
} from './capture';

const request = {
  postcode: 'ls6 3qs',
  fullName: ' Rob Request ',
  email: 'Rob@Example.com',
  phone: '',
  transmission: 'manual',
  experience: 'some',
  days: [1, 6],
  times: ['evening'],
  startWhen: 'this_month',
  budget: '42.50',
  consent: true,
};

describe('coming soon: the waiting list and lesson requests (MKT-10, M5-10)', () => {
  it('keeps a place on the waiting list only with consent, the postcode and address tidied', () => {
    expect(waitingListSchema.parse({ postcode: 'ls63qs', fullName: 'Lily Learner', email: 'LILY@example.com', transmission: '', consent: true })).toEqual({
      postcode: 'LS6 3QS',
      fullName: 'Lily Learner',
      email: 'lily@example.com',
      transmission: undefined,
      consent: true,
    });
    expect(waitingListSchema.parse({ postcode: 'LS6 3QS', fullName: 'Lily', email: 'lily@example.com', transmission: 'both', consent: true }).transmission).toBe('both');
    const refused = waitingListSchema.safeParse({ postcode: 'LS6 3QS', fullName: 'Lily', email: 'lily@example.com', consent: false });
    expect(refused.success).toBe(false);
    expect(refused.error?.issues[0]?.message).toBe('Tick the box so we may keep this and email you about it');
    expect(waitingListSchema.safeParse({ postcode: 'not one', fullName: 'Lily', email: 'lily@example.com', consent: true }).error?.issues[0]?.message).toBe(
      'Enter a UK postcode like LS1 4DY',
    );
  });

  it('reads a lesson request as the form sends it: a budget in pence, and no phone as none', () => {
    expect(lessonRequestSchema.parse(request)).toEqual({
      postcode: 'LS6 3QS',
      fullName: 'Rob Request',
      email: 'rob@example.com',
      phone: null,
      transmission: 'manual',
      experience: 'some',
      days: [1, 6],
      times: ['evening'],
      startWhen: 'this_month',
      budget: 4250,
      consent: true,
    });
    expect(lessonRequestSchema.parse({ ...request, phone: '07700 900123', budget: '' })).toMatchObject({ phone: '+447700900123', budget: null });
  });

  it('says what to fix in a lesson request', () => {
    const messages = (input: Record<string, unknown>) => lessonRequestSchema.safeParse({ ...request, ...input }).error?.issues.map((issue) => issue.message);
    expect(messages({ days: [] })).toEqual(['Choose at least one day']);
    expect(messages({ times: [] })).toEqual(['Choose at least one time of day']);
    expect(messages({ budget: 'forty' })).toEqual(['Enter an amount in pounds, like 40']);
    expect(messages({ budget: '500' })).toEqual(['Enter an amount between £1 and £200']);
    expect(messages({ phone: '0113 496 0000' })).toEqual(['Enter a UK mobile number like 07700 900123, or leave it empty']);
  });

  it('confirms by email what was kept, with one button that removes it', () => {
    expect(captureConfirmationWords('waiting_list', 'LS')).toEqual({
      title: 'You are on the waiting list for LS',
      body: 'We will email you when you can find and book driving instructors near LS. If this was not you, or you change your mind, remove your details with the button below.',
      action: 'Remove my details',
    });
    expect(captureConfirmationWords('lesson_request', 'M')).toMatchObject({
      title: 'We have your lesson request for M',
      action: 'Remove my details',
    });
  });

  it('writes the consent for the area the postcode is in, the words kept with the entry', () => {
    expect(waitingListConsent('LS6 3QS')).toBe(
      'Keep my details and email me when I can find and book driving instructors near LS. I can leave the list at any time.',
    );
    expect(lessonRequestConsent('SW1A 1AA')).toBe(
      'Keep my lesson request and email me about it when instructors near SW can take bookings through the app. I can withdraw it at any time.',
    );
  });

  it('tells somebody waiting that their area has opened, once, in the words their consent promised (D-117, M5-19)', () => {
    expect(regionOpenedWords('waiting_list', 'LS')).toEqual({
      title: 'Driving instructors near LS are taking bookings',
      body: 'You asked us to email you when you could find and book driving instructors near LS, and now you can. We have taken you off the waiting list, so this is the only email about it.',
      action: 'Find an instructor',
    });
    const request = regionOpenedWords('lesson_request', 'M');
    expect(request.title).toBe('Driving instructors near M are taking bookings');
    expect(request.body).toContain('We keep your request until you remove it');
  });
});
