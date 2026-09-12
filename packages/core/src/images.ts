/**
 * Avatar rules, shared by the browser that prepares the file, the Server Action that records
 * it and the storage bucket that holds it (INS-01, AUTH-04, M1-03).
 *
 * Photos are re-encoded in the browser before they are uploaded. That is what removes the
 * camera metadata, including the GPS position of the person's home, which would otherwise
 * travel with a public profile picture.
 */

export const avatarImage = {
  /** One output type, so the bucket can refuse everything else. */
  outputType: 'image/webp',
  outputQuality: 0.85,
  /** Square. Large enough for a profile header on a high-density screen. */
  size: 512,
  /** What a person may choose. HEIC is left out: no browser decodes it reliably. */
  acceptedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  /** Before processing, so a photo straight off a phone is accepted. */
  maxInputBytes: 15 * 1024 * 1024,
  /** After processing. A 512 px WebP is far below this; the bucket enforces it as well. */
  maxOutputBytes: 2 * 1024 * 1024,
} as const;

export function isAcceptedImageType(type: string): boolean {
  return (avatarImage.acceptedTypes as readonly string[]).includes(type);
}

export interface AvatarCrop {
  /** Source rectangle, always square, taken from the middle of the picture. */
  x: number;
  y: number;
  side: number;
  /** Output width and height. Smaller than the target when the picture is smaller. */
  size: number;
}

/**
 * Middle square of the picture, scaled to the avatar size. A picture smaller than the target
 * keeps its own size rather than being blown up, which only adds bytes and blur.
 */
export function centreCrop(width: number, height: number, target: number = avatarImage.size): AvatarCrop {
  const side = Math.min(width, height);
  return {
    x: Math.round((width - side) / 2),
    y: Math.round((height - side) / 2),
    side,
    size: Math.min(target, side),
  };
}

/**
 * Objects live under the instructor profile they belong to, which is what the storage policy
 * checks. The token makes each upload a new object, so a changed photo is never served from
 * a cache, and the old one is deleted afterwards.
 */
export function avatarObjectPath(profileId: string, token: string): string {
  return `${profileId}/${token}.webp`;
}

const avatarFileName = /^[a-z0-9-]{8,64}\.webp$/;

/** Guards the Server Action: a path may only name a folder the caller owns. */
export function isAvatarObjectPath(path: string, profileId: string): boolean {
  const parts = path.split('/');
  return parts.length === 2 && parts[0] === profileId && avatarFileName.test(parts[1] ?? '');
}
