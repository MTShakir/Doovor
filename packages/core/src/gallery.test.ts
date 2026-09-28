import { describe, expect, it } from 'vitest';
import { passBannerWords } from './gallery.ts';

describe('what the banner under a pass photo says (D-218)', () => {
  it('names the learner, the day and the school', () => {
    expect(passBannerWords({ learnerName: 'Lee One', passedOn: '2026-09-15', businessName: 'Asha Driving' })).toBe(
      'Lee One became a driver on Tue 15 Sep 2026 with Asha Driving',
    );
  });

  it('leaves the school out when there is nothing to say', () => {
    expect(passBannerWords({ learnerName: 'Lee One', passedOn: '2026-09-15', businessName: '  ' })).toBe(
      'Lee One became a driver on Tue 15 Sep 2026',
    );
  });

  it('tidies up what it is given rather than printing the spaces', () => {
    expect(passBannerWords({ learnerName: '  Jaz Hall ', passedOn: '2024-01-02', businessName: ' Bee School ' })).toBe(
      'Jaz Hall became a driver on Tue 2 Jan 2024 with Bee School',
    );
  });
});
