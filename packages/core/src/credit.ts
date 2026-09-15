/**
 * Lesson credit: time a learner has bought from one Business, and what happens to it (PAY-04,
 * PAY-07, PAY-12, R-07, M3-11).
 *
 * Credit is minutes, bought in lots. A lot is one package purchase: so many minutes, for so
 * much money, perhaps with a date it runs out. Lessons use minutes from the oldest lots first.
 * Every change is a ledger move against one lot, so the balance is always the sum of the moves
 * and a refund of unused time is valued at the price that lot was bought for.
 *
 * Everything here is whole minutes and whole pence. Where a lot's price does not divide by its
 * minutes, the learner is never given back more than they paid: values are rounded down, and
 * worked out from what is left in the lot rather than piece by piece, so refunding a lot in
 * several goes comes to exactly what refunding it in one would.
 */

export interface CreditLot {
  id: string;
  minutesTotal: number;
  minutesRemaining: number;
  pricePence: number;
  purchasedAt: Date;
  /** When the minutes stop being usable. Null for credit that never runs out. */
  expiresAt: Date | null;
}

/** The kinds of move the ledger records (ARCHITECTURE 8.3). */
export type LedgerKind = 'purchase' | 'use' | 'return' | 'fee' | 'expiry' | 'adjustment' | 'refund';

/** One change to one lot. Minutes are signed: negative when they leave the learner's balance. */
export interface LedgerMove {
  lotId: string;
  kind: LedgerKind;
  minutes: number;
  /** What a refund of these minutes is worth, for a `refund` move. */
  valuePence?: number;
}

/** Minutes a lesson took from one lot, in the order it took them. */
export interface CreditUse {
  lotId: string;
  minutes: number;
}

function assertMinutes(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${label} must be whole minutes, got ${String(value)}`);
}

/** The lot a package purchase becomes (PAY-04). */
export function lotFromPurchase(input: {
  id: string;
  minutes: number;
  pricePence: number;
  purchasedAt: Date;
  /** How long the package lasts. Null or missing for credit that never runs out. */
  expiryDays?: number | null;
}): CreditLot {
  assertMinutes(input.minutes, 'minutes');
  if (input.minutes === 0) throw new RangeError('a package has to buy some time');
  if (!Number.isSafeInteger(input.pricePence) || input.pricePence < 0) {
    throw new RangeError(`price must be integer pence, got ${String(input.pricePence)}`);
  }
  const days = input.expiryDays ?? null;
  return {
    id: input.id,
    minutesTotal: input.minutes,
    minutesRemaining: input.minutes,
    pricePence: input.pricePence,
    purchasedAt: input.purchasedAt,
    expiresAt: days === null ? null : new Date(input.purchasedAt.getTime() + days * 86_400_000),
  };
}

export function isLotExpired(lot: CreditLot, now: Date): boolean {
  return lot.expiresAt !== null && lot.expiresAt.getTime() <= now.getTime();
}

/** Lots with time left that can still be used, oldest purchase first. */
export function usableLots(lots: readonly CreditLot[], now: Date): CreditLot[] {
  return lots
    .filter((lot) => lot.minutesRemaining > 0 && !isLotExpired(lot, now))
    .sort((a, b) => a.purchasedAt.getTime() - b.purchasedAt.getTime() || a.id.localeCompare(b.id));
}

/** The minutes a learner can book with now (PAY-06). */
export function balanceMinutes(lots: readonly CreditLot[], now: Date): number {
  return usableLots(lots, now).reduce((sum, lot) => sum + lot.minutesRemaining, 0);
}

/** Applies moves to lots, as the database does in the same transaction that writes them. */
export function applyMoves(lots: readonly CreditLot[], moves: readonly LedgerMove[]): CreditLot[] {
  const change = new Map<string, number>();
  for (const move of moves) change.set(move.lotId, (change.get(move.lotId) ?? 0) + move.minutes);
  return lots.map((lot) => {
    const delta = change.get(lot.id) ?? 0;
    const remaining = lot.minutesRemaining + delta;
    if (remaining < 0 || remaining > lot.minutesTotal) {
      throw new RangeError(`lot ${lot.id} cannot hold ${String(remaining)} of ${String(lot.minutesTotal)} minutes`);
    }
    return delta === 0 ? lot : { ...lot, minutesRemaining: remaining };
  });
}

/**
 * Takes a lesson's minutes from the oldest lots first (PAY-04). All or nothing: a lesson is
 * paid for with credit or it is not, so there is no half a lesson owed on a card. Null when
 * there is not enough.
 */
export function useCredit(lots: readonly CreditLot[], minutes: number, now: Date): LedgerMove[] | null {
  assertMinutes(minutes, 'minutes');
  if (minutes === 0) return [];

  const moves: LedgerMove[] = [];
  let needed = minutes;
  for (const lot of usableLots(lots, now)) {
    if (needed === 0) break;
    const take = Math.min(lot.minutesRemaining, needed);
    moves.push({ lotId: lot.id, kind: 'use', minutes: -take });
    needed -= take;
  }
  return needed === 0 ? moves : null;
}

/** The minutes a lesson took, per lot, from the moves that took them. */
export function usesFrom(moves: readonly LedgerMove[]): CreditUse[] {
  return moves.filter((move) => move.kind === 'use').map((move) => ({ lotId: move.lotId, minutes: -move.minutes }));
}

/**
 * What a cancelled lesson paid for with credit does to it (R-07). Every minute goes back to
 * the lot it came from, and any fee is then kept from those same lots, in the order the lesson
 * used them. Cancelled in time, the fee is nothing and it all comes back; late, the fee is what
 * the Business's policy keeps (`evaluateCancellation` works that out).
 */
export function settleCancelledCredit(uses: readonly CreditUse[], feeMinutes: number): LedgerMove[] {
  assertMinutes(feeMinutes, 'fee minutes');
  const moves: LedgerMove[] = uses
    .filter((use) => use.minutes > 0)
    .map((use) => ({ lotId: use.lotId, kind: 'return', minutes: use.minutes }));

  let fee = Math.min(
    feeMinutes,
    uses.reduce((sum, use) => sum + Math.max(0, use.minutes), 0),
  );
  for (const use of uses) {
    if (fee === 0) break;
    const keep = Math.min(Math.max(0, use.minutes), fee);
    if (keep > 0) moves.push({ lotId: use.lotId, kind: 'fee', minutes: -keep });
    fee -= keep;
  }
  return moves;
}

/** Credit that has run out comes off the balance, lot by lot (PAY-04). */
export function expireCredit(lots: readonly CreditLot[], now: Date): LedgerMove[] {
  return lots
    .filter((lot) => lot.minutesRemaining > 0 && isLotExpired(lot, now))
    .map((lot) => ({ lotId: lot.id, kind: 'expiry', minutes: -lot.minutesRemaining }));
}

/** What the unused minutes of a lot are worth, at the price it was bought for, rounded down. */
export function remainingValuePence(lot: CreditLot): number {
  return Math.floor((lot.pricePence * lot.minutesRemaining) / lot.minutesTotal);
}

/**
 * What refunding some of a lot's unused minutes is worth (PAY-07). Worked out from what is left
 * before and after, so pieces add up to the whole and never to more.
 */
export function refundValuePence(lot: CreditLot, minutes: number): number {
  assertMinutes(minutes, 'minutes');
  const taken = Math.min(minutes, lot.minutesRemaining);
  const before = remainingValuePence(lot);
  const after = Math.floor((lot.pricePence * (lot.minutesRemaining - taken)) / lot.minutesTotal);
  return before - after;
}

/**
 * Refunds unused credit, oldest lots first, the same order it would have been used in (PAY-07).
 * Expired credit is not refunded here: it has already left the balance. Null when there is not
 * that much to refund.
 */
export function refundCredit(
  lots: readonly CreditLot[],
  minutes: number,
  now: Date,
): { moves: LedgerMove[]; valuePence: number } | null {
  assertMinutes(minutes, 'minutes');
  const moves: LedgerMove[] = [];
  let needed = minutes;
  let valuePence = 0;
  for (const lot of usableLots(lots, now)) {
    if (needed === 0) break;
    const take = Math.min(lot.minutesRemaining, needed);
    const value = refundValuePence(lot, take);
    moves.push({ lotId: lot.id, kind: 'refund', minutes: -take, valuePence: value });
    valuePence += value;
    needed -= take;
  }
  return needed === 0 ? { moves, valuePence } : null;
}
