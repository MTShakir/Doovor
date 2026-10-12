/**
 * Which file in assets/brand each piece of logo data is made from (D-244, D-249). Each white file
 * has to be the same artwork as its black one, so only the black is carried across; the app
 * paints it whichever colour the place needs.
 */
export const logoMasters = [
  {
    module: 'horizontal',
    name: 'horizontalLogo',
    file: 'logo-horizontal.svg',
    whiteFile: 'logo-horizontal-white.svg',
    description: 'The wheel on the left and the name on the right: headers, emails and share images.',
  },
  {
    module: 'stacked',
    name: 'stackedLogo',
    file: 'logo-stacked.svg',
    whiteFile: 'logo-stacked-white.svg',
    description: 'The wheel above the name: square spaces.',
  },
  {
    module: 'tagline',
    name: 'taglineLogo',
    file: 'logo-tagline.svg',
    whiteFile: 'logo-tagline-white.svg',
    description: 'The horizontal logo with the slogan under the name. Only where it is at least 380 px wide, or the slogan cannot be read.',
  },
  {
    module: 'wheel',
    name: 'wheelLogo',
    file: 'icon.svg',
    whiteFile: undefined,
    description: 'The wheel alone.',
  },
  {
    module: 'app-icon',
    name: 'appIconLogo',
    file: 'app-icon.svg',
    whiteFile: undefined,
    description: "The wheel as the app icon has it: its frame is the icon's square, which is painted black behind it.",
  },
] as const;
