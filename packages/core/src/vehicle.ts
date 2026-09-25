/**
 * The car an instructor teaches in (MNY-03, D-199).
 *
 * A registration is checked against the shapes the DVLA has actually issued rather than against
 * the current one alone: a 1998 Corsa on a prefix plate is still a car somebody teaches in, and
 * refusing it would be refusing a real instructor.
 *
 * Stored without its space and in capitals, so the same plate typed three ways is one plate, and
 * shown back with the space where the DVLA puts it.
 */

/** Every shape still on the road, newest first. */
const registrationShapes: readonly RegExp[] = [
  // Current, since 2001: AB12 CDE.
  /^[A-Z]{2}[0-9]{2}[A-Z]{3}$/,
  // Prefix, 1983 to 2001: A123 BCD.
  /^[A-Z][0-9]{1,3}[A-Z]{3}$/,
  // Suffix, 1963 to 1983: ABC 123A.
  /^[A-Z]{3}[0-9]{1,3}[A-Z]$/,
  // Dateless, and Northern Ireland: ABC 1234 or 1234 AB.
  /^[A-Z]{1,3}[0-9]{1,4}$/,
  /^[0-9]{1,4}[A-Z]{1,3}$/,
];

/** Capitals, no spaces or punctuation. What is stored and what is compared. */
export function normaliseRegistration(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isUkRegistration(input: string): boolean {
  const plate = normaliseRegistration(input);
  if (plate.length < 2 || plate.length > 8) return false;
  return registrationShapes.some((shape) => shape.test(plate));
}

/**
 * The plate as it is painted: a space before the last three letters on a current plate, and
 * before the numbers on the older shapes. Anything we cannot place is shown as it was stored.
 */
export function formatRegistration(input: string): string {
  const plate = normaliseRegistration(input);
  if (/^[A-Z]{2}[0-9]{2}[A-Z]{3}$/.test(plate)) return `${plate.slice(0, 4)} ${plate.slice(4)}`;
  const prefix = /^([A-Z][0-9]{1,3})([A-Z]{3})$/.exec(plate);
  if (prefix) return `${prefix[1] ?? ''} ${prefix[2] ?? ''}`;
  const suffix = /^([A-Z]{3})([0-9]{1,3}[A-Z])$/.exec(plate);
  if (suffix) return `${suffix[1] ?? ''} ${suffix[2] ?? ''}`;
  const dateless = /^([A-Z]{1,3})([0-9]{1,4})$/.exec(plate);
  if (dateless) return `${dateless[1] ?? ''} ${dateless[2] ?? ''}`;
  return plate;
}

/** The oldest year a car on the road might plausibly have been built. */
export const oldestVehicleYear = 1950;

/** Whether a year is one a car could have been built in, allowing for next year's plates. */
export function isVehicleYear(year: number, now = new Date()): boolean {
  return Number.isInteger(year) && year >= oldestVehicleYear && year <= now.getUTCFullYear() + 1;
}

/**
 * What to call a car: "Toyota Yaris", else whatever it was called before make and model were
 * asked for, else its plate. Cars added early have only the one name, and it is still theirs.
 */
export function vehicleName(input: {
  make?: string | null;
  model?: string | null;
  registration?: string | null;
  name?: string | null;
}): string {
  const named = [input.make?.trim(), input.model?.trim()].filter((part) => part !== undefined && part !== '').join(' ');
  if (named !== '') return named;
  const given = input.name?.trim();
  if (given !== undefined && given !== '') return given;
  const plate = input.registration?.trim();
  return plate === undefined || plate === '' ? 'A car' : formatRegistration(plate);
}
