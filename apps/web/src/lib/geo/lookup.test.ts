import { describe, expect, it } from 'vitest';
import { answerFor } from './lookup';

const place = {
  postcode: 'LS6 3HN',
  outcode: 'LS6',
  latitude: 53.815,
  longitude: -1.566,
  district: 'Leeds',
  country: 'England',
};

describe('postcode answers (COV-03, M1-05)', () => {
  it('returns the place, without the parts a screen does not need', () => {
    const answer = answerFor({ ok: true, place });

    expect(answer.status).toBe(200);
    expect(answer.body).toEqual({
      ok: true,
      data: { postcode: 'LS6 3HN', outcode: 'LS6', latitude: 53.815, longitude: -1.566, district: 'Leeds' },
    });
  });

  it('tells someone who typed something that is not a postcode what one looks like', () => {
    const answer = answerFor({ ok: false, reason: 'INVALID' });

    expect(answer.status).toBe(400);
    expect(answer.body).toMatchObject({ ok: false, code: 'VALIDATION_FAILED', message: 'Enter a UK postcode like LS1 4DY' });
  });

  it('says a well formed postcode was not found, which is a different mistake', () => {
    const answer = answerFor({ ok: false, reason: 'NOT_FOUND' });

    expect(answer.status).toBe(404);
    expect(answer.body).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
      message: 'We could not find that postcode. Check it and try again',
    });
  });

  it('does not blame the person when the service is down', () => {
    const answer = answerFor({ ok: false, reason: 'UNAVAILABLE' });

    expect(answer.status).toBe(503);
    expect(answer.body).toMatchObject({
      ok: false,
      code: 'UNKNOWN',
      message: 'We could not check that postcode just now. Try again in a moment',
    });
  });
});
