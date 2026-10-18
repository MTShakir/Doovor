import { horizontalLogo } from '@repo/config/logo/horizontal';

const logoHeight = 28;
const logoWidth = Math.round((logoHeight * horizontalLogo.width) / horizontalLogo.height);
const tilePadding = { x: 12, y: 8 };

/**
 * The logo at the top of every email (D-249, D-275). Email cannot show SVG, so these are pictures
 * the app draws at twice this size from the logo's own shapes, at these addresses.
 *
 * Black on a white tile with rounded corners, so a mail app that darkens everything else for the
 * night, as Gmail does, shows a tile that was meant rather than a box; a black logo on nothing would
 * be black on black there. A mail app that says it is dark (Apple Mail, Outlook) gets the logo in
 * white on a black tile instead, which also stays readable where such an app keeps the email's light
 * grey. With pictures turned off, the name shows in its place.
 */
export const emailLogo = {
  path: '/brand/email-logo.png',
  darkPath: '/brand/email-logo-dark.png',
  /** The logo itself, inside the tile. */
  logoHeight,
  logoWidth,
  padding: tilePadding,
  radius: 12,
  /** The whole picture, the tile: the same size for the light one and the dark one. */
  height: logoHeight + tilePadding.y * 2,
  width: logoWidth + tilePadding.x * 2,
  scale: 2,
} as const;

/** The same pictures, smaller, signing off the footer (D-258). */
export const footerLogo = {
  height: Math.round(emailLogo.height * 0.7),
  width: Math.round(emailLogo.width * 0.7),
} as const;
