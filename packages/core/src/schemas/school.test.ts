import { describe, expect, it } from 'vitest';
import {
  answerOfferSchema,
  enquiryConsentWords,
  giveEnquirySchema,
  instructorInviteSchema,
  invitationIdSchema,
  inviteKindsFor,
  lessonSellerChoiceSchema,
  memberPermissionSchema,
  memberSwitchSchema,
  offerEnquirySchema,
  officeEnquiryConsentWords,
  officeEnquirySchema,
  schoolDetailsSchema,
  schoolEnquirySchema,
} from './school.ts';

const details = { name: '  Northern Lights Driving ', postcode: 'm1 1ae', expectedInstructors: ' 6 ', lessonSeller: 'both' };

describe('setting up a school (AUTH-05, M5-11)', () => {
  it('takes the name, the main postcode, roughly how many instructors and who sells the lessons', () => {
    expect(schoolDetailsSchema.parse(details)).toEqual({
      name: 'Northern Lights Driving',
      postcode: 'M1 1AE',
      expectedInstructors: 6,
      lessonSeller: 'both',
    });
  });

  it('asks who sells the lessons, the school, its instructors or both, and chooses nothing for them (D-281)', () => {
    for (const lessonSeller of ['school', 'instructors', 'both']) {
      expect(lessonSellerChoiceSchema.parse({ lessonSeller })).toEqual({ lessonSeller });
    }
    expect(lessonSellerChoiceSchema.safeParse({}).error?.issues[0]?.message).toBe('Choose who sells your lessons');
    expect(lessonSellerChoiceSchema.safeParse({ lessonSeller: 'learners' }).error?.issues[0]?.message).toBe('Choose who sells your lessons');
  });

  it('keeps the logo path it was given, and null removes the logo', () => {
    expect(schoolDetailsSchema.parse({ ...details, logoPath: 'businesses/b/logo-abcdefgh.webp' }).logoPath).toBe(
      'businesses/b/logo-abcdefgh.webp',
    );
    expect(schoolDetailsSchema.parse({ ...details, logoPath: null }).logoPath).toBeNull();
  });

  it('says what to fix', () => {
    const result = schoolDetailsSchema.safeParse({ name: ' ', postcode: 'nowhere', expectedInstructors: '', lessonSeller: 'both' });
    expect(result.success).toBe(false);
    const messages = result.error?.issues.map((issue) => [issue.path.join('.'), issue.message]);
    expect(messages).toEqual([
      ['name', 'Enter your school name'],
      ['postcode', 'Enter a UK postcode like M1 1AE'],
      ['expectedInstructors', 'Enter how many instructors teach for you, like 6'],
    ]);
  });

  it('holds the number of instructors to what the database takes', () => {
    expect(schoolDetailsSchema.safeParse({ ...details, expectedInstructors: '0' }).error?.issues[0]?.message).toBe('Enter at least 1');
    expect(schoolDetailsSchema.safeParse({ ...details, expectedInstructors: '501' }).error?.issues[0]?.message).toBe('Enter 500 or fewer');
    expect(schoolDetailsSchema.safeParse({ ...details, expectedInstructors: '2.5' }).success).toBe(false);
    expect(schoolDetailsSchema.safeParse({ ...details, expectedInstructors: '500' }).success).toBe(true);
  });
});

describe('inviting an instructor to the school (AUTH-05)', () => {
  it('needs a mobile for a text or WhatsApp, and an address for an email', () => {
    const noPhone = instructorInviteSchema.safeParse({ channel: 'sms', fullName: 'Nia', email: '', phone: '' });
    expect(noPhone.error?.issues.map((issue) => [issue.path.join('.'), issue.message])).toEqual([
      ['phone', 'Enter a mobile number to send it to'],
    ]);
    const noEmail = instructorInviteSchema.safeParse({ channel: 'email', fullName: '', email: '', phone: '' });
    expect(noEmail.error?.issues[0]?.path).toEqual(['email']);
  });

  it('invites the instructors the school has, from who sells its lessons (D-281)', () => {
    expect(inviteKindsFor('school')).toEqual(['member']);
    expect(inviteKindsFor(null)).toEqual(['member']);
    expect(inviteKindsFor('instructors')).toEqual(['link']);
    expect(inviteKindsFor('both')).toEqual(['member', 'link']);
  });

  it('invites to teach under the school unless asked to link a business of their own (D-282)', () => {
    expect(instructorInviteSchema.parse({ channel: 'link', fullName: '', email: '', phone: '' }).kind).toBe('member');
    expect(instructorInviteSchema.parse({ kind: 'link', channel: 'link', fullName: '', email: '', phone: '' }).kind).toBe('link');
    expect(instructorInviteSchema.safeParse({ kind: 'learner', channel: 'link', fullName: '', email: '', phone: '' }).success).toBe(false);
  });

  it('needs nothing but the channel for a plain link, and tidies what it is given', () => {
    expect(instructorInviteSchema.parse({ channel: 'link', fullName: '', email: '', phone: '' })).toEqual({
      kind: 'member',
      channel: 'link',
      fullName: '',
      email: null,
      phone: null,
    });
    expect(instructorInviteSchema.parse({ channel: 'whatsapp', fullName: ' Nia ', email: '', phone: '07700 900555' })).toEqual({
      kind: 'member',
      channel: 'whatsapp',
      fullName: 'Nia',
      email: null,
      phone: '+447700900555',
    });
  });
});

describe('managing the team (SCH-02, M5-13)', () => {
  const membershipId = '6f1c3a52-9d8e-4b7a-8c61-2f0e9b4d7a13';

  it('changes one of the two things a member may be allowed, and nothing else', () => {
    expect(memberPermissionSchema.parse({ membershipId, permission: 'set_own_prices', allowed: true })).toEqual({
      membershipId,
      permission: 'set_own_prices',
      allowed: true,
    });
    expect(memberPermissionSchema.safeParse({ membershipId, permission: 'manage_billing', allowed: true }).success).toBe(false);
    expect(memberPermissionSchema.safeParse({ membershipId, permission: 'view_revenue', allowed: 'yes' }).success).toBe(false);
  });

  it('switches a member by the id of their membership, and cancels an invitation by its own', () => {
    expect(memberSwitchSchema.parse({ membershipId, active: false })).toEqual({ membershipId, active: false });
    expect(memberSwitchSchema.safeParse({ membershipId: 'not-an-id', active: false }).success).toBe(false);
    expect(invitationIdSchema.safeParse(membershipId).success).toBe(true);
    expect(invitationIdSchema.safeParse('').success).toBe(false);
  });
});

describe('somebody asking a school for lessons (M9-15, D-288)', () => {
  const asked = { fullName: 'Pat Pupil', email: 'Pat@Example.com', phone: '', postcode: 'm1 1ae', transmission: 'automatic', note: 'Evenings', agreed: true };

  it('takes a name, a way to reach them, their postcode and what they want', () => {
    expect(schoolEnquirySchema.parse(asked)).toEqual({
      fullName: 'Pat Pupil',
      email: 'pat@example.com',
      phone: null,
      postcode: 'M1 1AE',
      transmission: 'automatic',
      note: 'Evenings',
      agreed: true,
    });
    expect(schoolEnquirySchema.parse({ ...asked, email: '', phone: '07700 900123' }).phone).toBe('+447700900123');
  });

  it('needs one way to reach them, and their agreement', () => {
    const none = schoolEnquirySchema.safeParse({ ...asked, email: '', phone: '' });
    expect(none.error?.issues.map((issue) => [issue.path[0], issue.message])).toEqual([['email', 'Enter an email address or a mobile number']]);
    expect(schoolEnquirySchema.safeParse({ ...asked, agreed: false }).error?.issues[0]?.message).toBe(
      'Tick this so the school can pass your details to an instructor',
    );
    expect(officeEnquirySchema.safeParse({ ...asked, agreed: false }).error?.issues[0]?.message).toBe('Tick this once they have agreed');
  });

  it('says what they agree to in the school\'s name', () => {
    expect(enquiryConsentWords('Bee School')).toBe(
      'I agree to Bee School keeping these details and passing them to one of its instructors, who will contact me about lessons.',
    );
    expect(officeEnquiryConsentWords('Bee School')).toContain('They agreed to Bee School');
  });
});

describe('offering and giving a new pupil (M9-17, M9-18, D-289)', () => {
  const enquiryId = '0a1b2c3d-4e5f-4061-8728-394a5b6c7d8e';
  const linkId = '1b2c3d4e-5f60-4718-8a9b-0c1d2e3f4a5b';

  it('offers to at least one linked instructor, for a while they choose from', () => {
    expect(offerEnquirySchema.parse({ enquiryId, linkIds: [linkId], hours: '24' })).toEqual({ enquiryId, linkIds: [linkId], hours: 24 });
    expect(offerEnquirySchema.safeParse({ enquiryId, linkIds: [], hours: '24' }).error?.issues[0]?.message).toBe('Choose at least one instructor');
    expect(offerEnquirySchema.safeParse({ enquiryId, linkIds: [linkId], hours: '5' }).error?.issues[0]?.message).toBe('Choose how long they have to answer');
  });

  it('gives to one instructor, and takes a yes or a no', () => {
    expect(giveEnquirySchema.safeParse({ enquiryId, instructorId: '' }).error?.issues[0]?.message).toBe('Choose an instructor');
    expect(answerOfferSchema.parse({ offerId: linkId, accept: false })).toEqual({ offerId: linkId, accept: false });
  });
});
