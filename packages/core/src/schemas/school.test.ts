import { describe, expect, it } from 'vitest';
import { instructorInviteSchema, invitationIdSchema, memberPermissionSchema, memberSwitchSchema, schoolDetailsSchema } from './school.ts';

const details = { name: '  Northern Lights Driving ', postcode: 'm1 1ae', expectedInstructors: ' 6 ' };

describe('setting up a school (AUTH-05, M5-11)', () => {
  it('takes the name, the main postcode and roughly how many instructors', () => {
    expect(schoolDetailsSchema.parse(details)).toEqual({ name: 'Northern Lights Driving', postcode: 'M1 1AE', expectedInstructors: 6 });
  });

  it('keeps the logo path it was given, and null removes the logo', () => {
    expect(schoolDetailsSchema.parse({ ...details, logoPath: 'businesses/b/logo-abcdefgh.webp' }).logoPath).toBe(
      'businesses/b/logo-abcdefgh.webp',
    );
    expect(schoolDetailsSchema.parse({ ...details, logoPath: null }).logoPath).toBeNull();
  });

  it('says what to fix', () => {
    const result = schoolDetailsSchema.safeParse({ name: ' ', postcode: 'nowhere', expectedInstructors: '' });
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

  it('needs nothing but the channel for a plain link, and tidies what it is given', () => {
    expect(instructorInviteSchema.parse({ channel: 'link', fullName: '', email: '', phone: '' })).toEqual({
      channel: 'link',
      fullName: '',
      email: null,
      phone: null,
    });
    expect(instructorInviteSchema.parse({ channel: 'whatsapp', fullName: ' Nia ', email: '', phone: '07700 900555' })).toEqual({
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
