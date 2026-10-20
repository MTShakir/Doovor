import { formatPence } from '@repo/core/money';

/**
 * What the school an instructor's Business is linked to recommends and allows an hour (M9-10,
 * D-286), and any of their prices above the most, which stay until they change them.
 */
export function PriceGuideNote({
  school,
  recommendedHourlyPence,
  maxHourlyPence,
  above = [],
}: {
  school: string;
  recommendedHourlyPence: number | null;
  maxHourlyPence: number | null;
  /** Their prices above the most, said the way their forms say them. */
  above?: readonly string[];
}) {
  if (recommendedHourlyPence === null && maxHourlyPence === null) return null;
  const said =
    recommendedHourlyPence !== null && maxHourlyPence !== null
      ? `${school} recommends ${formatPence(recommendedHourlyPence)} an hour, and lets you charge at most ${formatPence(maxHourlyPence)} an hour.`
      : recommendedHourlyPence !== null
        ? `${school} recommends ${formatPence(recommendedHourlyPence)} an hour. Your prices are yours to set.`
        : `${school} lets you charge at most ${formatPence(maxHourlyPence ?? 0)} an hour.`;
  return (
    <div className="flex flex-col gap-2 rounded-card bg-grey-100 p-4 text-small text-ink">
      <p>{said}</p>
      {above.length === 0 ? null : (
        <div className="flex flex-col gap-1">
          <p className="font-semibold">Above the most, until you change them:</p>
          <ul className="list-disc pl-5">
            {above.map((one) => (
              <li key={one}>{one}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
