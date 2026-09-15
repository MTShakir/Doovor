/** The app's icons (PRD 8.1, M4-08): which there are, and what each is for. Drawn in icon-art.tsx. */

export interface AppIcon {
  /** The file as the manifest and the page name it: `/icons/<file>`. */
  file: string;
  size: number;
  /**
   * Android crops a maskable icon to a circle, a squircle or a rounded square, so its mark sits
   * inside the middle 80% where every crop keeps it.
   */
  purpose: 'any' | 'maskable';
}

export const appIcons: readonly AppIcon[] = [
  { file: '192.png', size: 192, purpose: 'any' },
  { file: '512.png', size: 512, purpose: 'any' },
  { file: 'maskable-512.png', size: 512, purpose: 'maskable' },
  // The home screen icon on an iPhone, which rounds its own corners.
  { file: 'apple-touch-180.png', size: 180, purpose: 'any' },
];

export function appIcon(file: string): AppIcon | undefined {
  return appIcons.find((icon) => icon.file === file);
}
