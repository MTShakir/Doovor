const browsers: [marker: string, label: string][] = [
  ['Edg/', 'Edge'],
  ['OPR/', 'Opera'],
  ['Firefox/', 'Firefox'],
  ['Chrome/', 'Chrome'],
  ['CriOS/', 'Chrome'],
  ['Safari/', 'Safari'],
];

const systems: [marker: string, label: string][] = [
  ['iPhone', 'iPhone'],
  ['iPad', 'iPad'],
  ['Android', 'Android'],
  ['Windows', 'Windows'],
  ['Macintosh', 'Mac'],
  ['Mac OS X', 'Mac'],
  ['Linux', 'Linux'],
];

function firstMatch(userAgent: string, table: [string, string][]): string | null {
  return table.find(([marker]) => userAgent.includes(marker))?.[1] ?? null;
}

/** Short, friendly device labels for the devices list (AUTH-09), for example "Chrome on Windows". */
export function describeUserAgent(userAgent: string | null | undefined): string {
  if (!userAgent) return 'Unknown device';
  const browser = firstMatch(userAgent, browsers);
  const os = firstMatch(userAgent, systems);
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? 'Unknown device';
}
