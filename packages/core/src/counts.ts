const grouped = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });

/** A count as people read it: "7", "4,310", "1,250,000". Whole numbers only. */
export function formatCount(count: number): string {
  if (!Number.isSafeInteger(count)) throw new RangeError(`A count must be a whole number, got ${String(count)}`);
  return grouped.format(count);
}

/** A count with what it counts: "1 payment", "0 payments", "3,402 payments". */
export function countOf(count: number, one: string, many: string): string {
  return `${formatCount(count)} ${count === 1 ? one : many}`;
}
