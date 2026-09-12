/**
 * Which map to draw, and with what (COV-01, M1-06).
 *
 * The map library itself is never imported here: this says only what a screen needs to know
 * before it decides whether to load one. Mapbox charges per map load and needs a token, so a
 * build without one falls back to a drawing rather than a broken panel.
 */

export type MapKind = 'mapbox' | 'static';

export interface MapSettings {
  kind: MapKind;
  /** Present only for `mapbox`. */
  token?: string;
  /** Monochrome, so the circle and the pin are the only colour on it (PRD 7.2). */
  styleUrl: string;
}

/** Mapbox's own greyscale style. Owned by Mapbox, so it needs no account of ours to publish. */
export const monochromeStyleUrl = 'mapbox://styles/mapbox/light-v11';

export function mapSettings(token: string | undefined): MapSettings {
  const trimmed = token?.trim() ?? '';
  // A token is public by design (it is in the page), but an empty one is not a token.
  return trimmed === ''
    ? { kind: 'static', styleUrl: monochromeStyleUrl }
    : { kind: 'mapbox', token: trimmed, styleUrl: monochromeStyleUrl };
}
