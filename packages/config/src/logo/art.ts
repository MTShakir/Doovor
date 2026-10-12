/**
 * The logo as shapes (D-244, D-249). The masters are the SVG files in assets/brand; `pnpm
 * brand:logo` reads them with logoArtFromSvg and writes each one here as plain data, which the
 * header, the app icons, the share images and the emails all draw from. A test reads the masters
 * again and fails if what is here has drifted from them.
 */

export interface LogoPath {
  /** The outline, as SVG path data. */
  d: string;
  /** Filled even-odd, so a shape inside another cuts a hole in it rather than filling it. */
  evenOdd: boolean;
}

export interface LogoArt {
  /** The frame the shapes are drawn in, in the drawing's own units: its proportions, not pixels. */
  width: number;
  height: number;
  paths: readonly LogoPath[];
}

/** Anything in a logo that is more than a filled shape, and so would not come across as one. */
const refused = ['text', 'image', 'use', 'g', 'clipPath', 'mask', 'pattern', 'filter', 'linearGradient', 'radialGradient', 'circle', 'ellipse', 'line', 'polygon', 'polyline'];

/**
 * Reads a logo exported as a plain SVG: its frame from the viewBox, and every path, with whether
 * its class or its own attribute fills it even-odd. A rectangle is the app icon's background,
 * which the app paints itself, so it is left out. Anything else is refused by name, so a file
 * exported the wrong way says what is wrong with it rather than drawing something different.
 */
export function logoArtFromSvg(svg: string): LogoArt {
  const viewBox = /<svg\b[^>]*\sviewBox="([^"]*)"/.exec(svg)?.[1]?.trim().split(/[\s,]+/).map(Number);
  if (viewBox?.length !== 4 || viewBox.some((n) => !Number.isFinite(n))) {
    throw new Error('The SVG has no viewBox: export it with its artboard');
  }
  const [x, y, width, height] = viewBox as [number, number, number, number];
  if (x !== 0 || y !== 0) throw new Error('The viewBox does not start at 0 0: export it cropped to the artboard');

  for (const tag of refused) {
    if (new RegExp(`<${tag}\\b`).test(svg)) throw new Error(`The SVG has a <${tag}>, and only plain shapes are carried across`);
  }
  if (/\stransform="/.test(svg)) throw new Error('The SVG has a transform: export it with transforms applied');

  // Illustrator puts the fill rule in a class: ".st0, .st1 { fill: #fff; } .st1 { fill-rule: evenodd; }".
  const evenOddClasses = new Set<string>();
  const style = /<style\b[^>]*>([\s\S]*?)<\/style>/.exec(svg)?.[1] ?? '';
  for (const [, selectors = '', declarations = ''] of style.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (!/fill-rule\s*:\s*evenodd/.test(declarations)) continue;
    for (const selector of selectors.split(',')) {
      const name = /^\s*\.([\w-]+)\s*$/.exec(selector)?.[1];
      if (name !== undefined) evenOddClasses.add(name);
    }
  }

  const paths = [...svg.matchAll(/<path\b([^>]*?)\/?>/g)].map(([, attributes = '']) => {
    const d = /(?:^|\s)d="([^"]*)"/.exec(attributes)?.[1]?.replace(/\s+/g, ' ').trim();
    if (d === undefined || d === '') throw new Error('The SVG has a path with no outline');
    const classes = /(?:^|\s)class="([^"]*)"/.exec(attributes)?.[1]?.split(/\s+/) ?? [];
    const evenOdd = /(?:^|\s)fill-rule="evenodd"/.test(attributes) || classes.some((name) => evenOddClasses.has(name));
    return { d, evenOdd };
  });
  if (paths.length === 0) throw new Error('The SVG has no shapes');

  return { width, height, paths };
}

/**
 * Whether two exports are the same artwork in two colours: the same frame, and the same shapes
 * with the same fill rules. Not the same path text, because Illustrator can write one outline
 * two ways: the white horizontal logo draws exactly as the black one, pixel for pixel at 4096 px
 * wide, with different text in its paths.
 */
export function sameArtwork(a: LogoArt, b: LogoArt): boolean {
  return (
    a.width === b.width &&
    a.height === b.height &&
    a.paths.length === b.paths.length &&
    a.paths.every((path, index) => path.evenOdd === b.paths[index]?.evenOdd)
  );
}
