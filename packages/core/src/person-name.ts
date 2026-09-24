/**
 * A person's name in two halves (INS-01, D-196).
 *
 * One name is stored, because one name is what a learner reads. Asking for it in two fields is
 * better for the person filling the form: it says plainly that we want the name they are known by
 * rather than a business, and it fills from a browser's saved details.
 *
 * Everything before the last space is the first half, so double-barrelled and middle names stay
 * where their owner put them, and a name with no space at all is a first name on its own.
 */
export interface NameHalves {
  firstName: string;
  lastName: string;
}

export function nameHalves(whole: string): NameHalves {
  const tidy = whole.trim().replace(/\s+/g, ' ');
  const lastSpace = tidy.lastIndexOf(' ');
  if (lastSpace === -1) return { firstName: tidy, lastName: '' };
  return { firstName: tidy.slice(0, lastSpace), lastName: tidy.slice(lastSpace + 1) };
}

/** The two halves back into the one name that is stored and shown. */
export function wholeName(halves: NameHalves): string {
  return [halves.firstName, halves.lastName]
    .map((half) => half.trim())
    .filter((half) => half !== '')
    .join(' ');
}
