/**
 * WCAG 2.2 relative luminance and contrast ratio (PRD 14.4).
 *
 * The maths moved to `@repo/core/colour` when a Server Action had to check the same thing an
 * instructor's colour picker checks (D-210). This re-exports it so the token tests and the design
 * page carry on reading it from here.
 */
export { AA_NON_TEXT, AA_TEXT, contrastRatio, relativeLuminance } from '@repo/core/colour';
