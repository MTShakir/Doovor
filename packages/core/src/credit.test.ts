import { describe, expect, it } from 'vitest';
import {
  applyMoves,
  balanceMinutes,
  expireCredit,
  isLotExpired,
  lotFromPurchase,
  refundCredit,
  refundValuePence,
  remainingValuePence,
  settleCancelledCredit,
  useCredit,
  usableLots,
  usesFrom,
  type CreditLot,
} from './credit.ts';

const day = (n: number) => new Date(Date.UTC(2026, 8, n, 9));
const now = day(15);

const lot = (id: string, minutes: number, pricePence: number, bought: Date, remaining = minutes, expiresAt: Date | null = null): CreditLot => ({
  id,
  minutesTotal: minutes,
  minutesRemaining: remaining,
  pricePence,
  purchasedAt: bought,
  expiresAt,
});

describe('buying credit (PAY-04, M3-11)', () => {
  it('turns a package into a lot of minutes with the date it runs out', () => {
    expect(lotFromPurchase({ id: 'a', minutes: 600, pricePence: 38000, purchasedAt: day(1), expiryDays: 180 })).toEqual({
      id: 'a',
      minutesTotal: 600,
      minutesRemaining: 600,
      pricePence: 38000,
      purchasedAt: day(1),
      expiresAt: new Date(day(1).getTime() + 180 * 86_400_000),
    });
    expect(lotFromPurchase({ id: 'b', minutes: 60, pricePence: 4200, purchasedAt: day(1) }).expiresAt).toBeNull();
  });

  it('refuses a package of no time, part minutes or money that is not pence', () => {
    expect(() => lotFromPurchase({ id: 'x', minutes: 0, pricePence: 100, purchasedAt: day(1) })).toThrow(RangeError);
    expect(() => lotFromPurchase({ id: 'x', minutes: 60.5, pricePence: 100, purchasedAt: day(1) })).toThrow(RangeError);
    expect(() => lotFromPurchase({ id: 'x', minutes: 60, pricePence: 42.5, purchasedAt: day(1) })).toThrow(RangeError);
  });
});

describe('the balance (PAY-06)', () => {
  const lots = [
    lot('newer', 120, 7600, day(10)),
    lot('older', 60, 4000, day(2)),
    lot('spent', 60, 4000, day(1), 0),
    lot('gone', 60, 4000, day(3), 60, day(14)),
  ];

  it('counts only time that is left and has not run out', () => {
    expect(balanceMinutes(lots, now)).toBe(180);
  });

  it('lists what can be used oldest first', () => {
    expect(usableLots(lots, now).map((one) => one.id)).toEqual(['older', 'newer']);
  });

  it('runs out a lot at the moment it expires, not after', () => {
    const edge = lot('edge', 60, 4000, day(1), 60, now);
    expect(isLotExpired(edge, now)).toBe(true);
    expect(isLotExpired(edge, new Date(now.getTime() - 1))).toBe(false);
  });
});

describe('using credit for a lesson (PAY-04)', () => {
  it('takes from the oldest lot first, and moves on when it runs dry', () => {
    const lots = [lot('b', 60, 4000, day(5)), lot('a', 25, 2000, day(1)), lot('c', 55, 3500, day(9))];

    const moves = useCredit(lots, 90, now);

    expect(moves).toEqual([
      { lotId: 'a', kind: 'use', minutes: -25 },
      { lotId: 'b', kind: 'use', minutes: -60 },
      { lotId: 'c', kind: 'use', minutes: -5 },
    ]);
    const after = applyMoves(lots, moves ?? []);
    expect(balanceMinutes(after, now)).toBe(50);
    expect(after.find((one) => one.id === 'c')?.minutesRemaining).toBe(50);
  });

  it('pays for a whole lesson or none of it', () => {
    expect(useCredit([lot('a', 60, 4000, day(1))], 90, now)).toBeNull();
    expect(useCredit([lot('a', 60, 4000, day(1), 60, day(2))], 30, now)).toBeNull();
    expect(useCredit([lot('a', 60, 4000, day(1))], 0, now)).toEqual([]);
  });

  it('refuses part minutes', () => {
    expect(() => useCredit([lot('a', 60, 4000, day(1))], 30.5, now)).toThrow(RangeError);
  });
});

describe('cancelling a lesson paid for with credit (R-07)', () => {
  const lots = [lot('a', 25, 2000, day(1)), lot('b', 60, 4000, day(5))];
  const moves = useCredit(lots, 60, now) ?? [];
  const uses = usesFrom(moves);
  const used = applyMoves(lots, moves);

  it('gives every minute back to the lot it came from when cancelled in time (acceptance-03)', () => {
    const back = settleCancelledCredit(uses, 0);

    expect(back).toEqual([
      { lotId: 'a', kind: 'return', minutes: 25 },
      { lotId: 'b', kind: 'return', minutes: 35 },
    ]);
    expect(balanceMinutes(applyMoves(used, back), now)).toBe(85);
  });

  it('keeps the fee from the lesson’s own credit when cancelled late, in the order it was used', () => {
    const settled = settleCancelledCredit(uses, 30);

    expect(settled).toEqual([
      { lotId: 'a', kind: 'return', minutes: 25 },
      { lotId: 'b', kind: 'return', minutes: 35 },
      { lotId: 'a', kind: 'fee', minutes: -25 },
      { lotId: 'b', kind: 'fee', minutes: -5 },
    ]);
    expect(balanceMinutes(applyMoves(used, settled), now)).toBe(55);
  });

  it('never keeps more than the lesson used', () => {
    const settled = settleCancelledCredit(uses, 500);
    expect(balanceMinutes(applyMoves(used, settled), now)).toBe(25);
  });
});

describe('credit that runs out (PAY-04)', () => {
  it('takes what is left off the balance, lot by lot, and leaves the rest alone', () => {
    const lots = [lot('old', 600, 38000, day(1), 90, day(14)), lot('spent', 60, 4000, day(1), 0, day(14)), lot('live', 60, 4000, day(2))];

    expect(expireCredit(lots, now)).toEqual([{ lotId: 'old', kind: 'expiry', minutes: -90 }]);
  });
});

describe('refunding unused credit (PAY-07)', () => {
  it('values minutes at the price the lot was bought for, rounded down', () => {
    // £380 for 600 minutes is 63.33p a minute.
    const package10 = lot('p', 600, 38000, day(1), 90);
    expect(remainingValuePence(package10)).toBe(5700);
    // What is left drops from 5700p to 5636.67p, rounded down to 5636p: the minute is 64p, and
    // the rounding is paid back by the minutes still to come, never by more than the lot cost.
    expect(refundValuePence(package10, 1)).toBe(64);
  });

  it('adds up to the whole when refunded in pieces, and never to more', () => {
    // £100 for 7 minutes is 1428.57p a minute: every split has a remainder.
    let odd = lot('odd', 7, 10000, day(1));
    const pieces: number[] = [];
    for (const take of [3, 1, 3]) {
      pieces.push(refundValuePence(odd, take));
      odd = { ...odd, minutesRemaining: odd.minutesRemaining - take };
    }
    expect(pieces.reduce((sum, one) => sum + one, 0)).toBe(10000);
    expect(pieces).toEqual([4286, 1429, 4285]);
  });

  it('refunds oldest lots first, and says what it comes to', () => {
    const lots = [lot('new', 60, 5000, day(9)), lot('old', 600, 38000, day(1), 30)];

    const refund = refundCredit(lots, 60, now);

    expect(refund).toEqual({
      moves: [
        { lotId: 'old', kind: 'refund', minutes: -30, valuePence: 1900 },
        { lotId: 'new', kind: 'refund', minutes: -30, valuePence: 2500 },
      ],
      valuePence: 4400,
    });
  });

  it('refunds nothing that is not there, and nothing that has already run out', () => {
    expect(refundCredit([lot('a', 60, 4000, day(1))], 90, now)).toBeNull();
    expect(refundCredit([lot('a', 60, 4000, day(1), 60, day(2))], 30, now)).toBeNull();
    expect(refundValuePence(lot('a', 60, 4000, day(1), 10), 30)).toBe(666);
  });
});

describe('moves that do not fit a lot', () => {
  it('cannot take a lot below nothing or fill it past what was bought', () => {
    const one = [lot('a', 60, 4000, day(1), 10)];
    expect(() => applyMoves(one, [{ lotId: 'a', kind: 'use', minutes: -20 }])).toThrow(RangeError);
    expect(() => applyMoves(one, [{ lotId: 'a', kind: 'return', minutes: 51 }])).toThrow(RangeError);
    expect(applyMoves(one, [{ lotId: 'z', kind: 'return', minutes: 5 }])).toEqual(one);
  });
});
