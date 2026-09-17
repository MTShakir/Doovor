/**
 * Postcode areas and the regional switch-on rule (PRD 4.1, 4.2, ADM-04).
 *
 * The learner marketplace opens one postcode area at a time: "M", "LS", "SW". An area opens once
 * enough verified instructors cover it with enough free hours in the next 14 days; the numbers are
 * platform settings, and the database counts both.
 */

/** Each postcode area by the place it is named after, as Royal Mail names them. */
const areaNames: Readonly<Record<string, string>> = {
  AB: 'Aberdeen', AL: 'St Albans', B: 'Birmingham', BA: 'Bath', BB: 'Blackburn', BD: 'Bradford', BH: 'Bournemouth',
  BL: 'Bolton', BN: 'Brighton', BR: 'Bromley', BS: 'Bristol', BT: 'Belfast', CA: 'Carlisle', CB: 'Cambridge',
  CF: 'Cardiff', CH: 'Chester', CM: 'Chelmsford', CO: 'Colchester', CR: 'Croydon', CT: 'Canterbury', CV: 'Coventry',
  CW: 'Crewe', DA: 'Dartford', DD: 'Dundee', DE: 'Derby', DG: 'Dumfries', DH: 'Durham', DL: 'Darlington',
  DN: 'Doncaster', DT: 'Dorchester', DY: 'Dudley', E: 'East London', EC: 'East Central London', EH: 'Edinburgh',
  EN: 'Enfield', EX: 'Exeter', FK: 'Falkirk', FY: 'Blackpool', G: 'Glasgow', GL: 'Gloucester', GU: 'Guildford',
  GY: 'Guernsey', HA: 'Harrow', HD: 'Huddersfield', HG: 'Harrogate', HP: 'Hemel Hempstead', HR: 'Hereford',
  HS: 'Outer Hebrides', HU: 'Hull', HX: 'Halifax', IG: 'Ilford', IM: 'Isle of Man', IP: 'Ipswich', IV: 'Inverness',
  JE: 'Jersey', KA: 'Kilmarnock', KT: 'Kingston upon Thames', KW: 'Kirkwall', KY: 'Kirkcaldy', L: 'Liverpool',
  LA: 'Lancaster', LD: 'Llandrindod Wells', LE: 'Leicester', LL: 'Llandudno', LN: 'Lincoln', LS: 'Leeds', LU: 'Luton',
  M: 'Manchester', ME: 'Rochester', MK: 'Milton Keynes', ML: 'Motherwell', N: 'North London', NE: 'Newcastle upon Tyne',
  NG: 'Nottingham', NN: 'Northampton', NP: 'Newport', NR: 'Norwich', NW: 'North West London', OL: 'Oldham',
  OX: 'Oxford', PA: 'Paisley', PE: 'Peterborough', PH: 'Perth', PL: 'Plymouth', PO: 'Portsmouth', PR: 'Preston',
  RG: 'Reading', RH: 'Redhill', RM: 'Romford', S: 'Sheffield', SA: 'Swansea', SE: 'South East London',
  SG: 'Stevenage', SK: 'Stockport', SL: 'Slough', SM: 'Sutton', SN: 'Swindon', SO: 'Southampton', SP: 'Salisbury',
  SR: 'Sunderland', SS: 'Southend-on-Sea', ST: 'Stoke-on-Trent', SW: 'South West London', SY: 'Shrewsbury',
  TA: 'Taunton', TD: 'Galashiels', TF: 'Telford', TN: 'Tonbridge', TQ: 'Torquay', TR: 'Truro', TS: 'Cleveland',
  TW: 'Twickenham', UB: 'Southall', W: 'West London', WA: 'Warrington', WC: 'West Central London', WD: 'Watford',
  WF: 'Wakefield', WN: 'Wigan', WR: 'Worcester', WS: 'Walsall', WV: 'Wolverhampton', YO: 'York', ZE: 'Shetland',
};

/** "Leeds" for "LS", or null for letters that are not a postcode area. */
export function postcodeAreaName(area: string): string | null {
  return areaNames[area.trim().toUpperCase()] ?? null;
}

/** "LS, Leeds", or the letters alone for an area not in the list. */
export function postcodeAreaLabel(area: string): string {
  const code = area.trim().toUpperCase();
  const name = postcodeAreaName(code);
  return name === null ? code : `${code}, ${name}`;
}

export interface SwitchOnRule {
  /** Verified instructors covering the area. */
  instructors: number;
  /** Free hours those instructors show across the next 14 days. */
  hours: number;
}

export interface RegionSupply {
  instructors: number;
  freeMinutes: number;
}

export interface Readiness {
  /** Both halves of the rule are met, so the area may open. */
  meetsRule: boolean;
  /** How many more instructors it needs; nought once it has enough. */
  instructorsShort: number;
  /** How many more whole hours it needs; nought once it has enough. */
  hoursShort: number;
}

/** Whether an area meets the switch-on rule, and by how much it falls short when it does not (PRD 4.2). */
export function readiness(supply: RegionSupply, rule: SwitchOnRule): Readiness {
  const instructorsShort = Math.max(0, rule.instructors - supply.instructors);
  const hoursShort = Math.max(0, Math.ceil((rule.hours * 60 - supply.freeMinutes) / 60));
  return { meetsRule: instructorsShort === 0 && supply.freeMinutes >= rule.hours * 60, instructorsShort, hoursShort };
}

/** Free time as the regions screen counts it: whole hours, rounded down, so an area never looks readier than it is. */
export function wholeHours(minutes: number): number {
  return Math.floor(Math.max(0, minutes) / 60);
}
