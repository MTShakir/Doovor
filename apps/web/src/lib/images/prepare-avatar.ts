'use client';

import { avatarImage, centreCrop, isAcceptedImageType } from '@repo/core/images';

/** Why a picture was refused. The picker turns these into copy. */
export type AvatarProblem = 'WRONG_TYPE' | 'TOO_BIG' | 'UNREADABLE';

export type PreparedAvatar = { ok: true; blob: Blob } | { ok: false; problem: AvatarProblem };

/**
 * Crops to the middle square, scales to the avatar size and re-encodes as WebP (M1-03).
 *
 * Re-encoding is what removes the camera metadata. A photo taken at home carries the GPS
 * position of that home, and a profile picture is public, so the original bytes never leave
 * the browser. The orientation is read from the file before the metadata goes, so a picture
 * taken in portrait is not stored on its side.
 */
export async function prepareAvatar(file: File): Promise<PreparedAvatar> {
  if (!isAcceptedImageType(file.type)) return { ok: false, problem: 'WRONG_TYPE' };
  if (file.size > avatarImage.maxInputBytes) return { ok: false, problem: 'TOO_BIG' };

  let picture: ImageBitmap;
  try {
    picture = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return { ok: false, problem: 'UNREADABLE' };
  }

  try {
    const crop = centreCrop(picture.width, picture.height);
    const canvas = document.createElement('canvas');
    canvas.width = crop.size;
    canvas.height = crop.size;
    const context = canvas.getContext('2d');
    if (!context) return { ok: false, problem: 'UNREADABLE' };
    context.drawImage(picture, crop.x, crop.y, crop.side, crop.side, 0, 0, crop.size, crop.size);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, avatarImage.outputType, avatarImage.outputQuality);
    });
    if (!blob) return { ok: false, problem: 'UNREADABLE' };
    if (blob.size > avatarImage.maxOutputBytes) return { ok: false, problem: 'TOO_BIG' };
    return { ok: true, blob };
  } finally {
    picture.close();
  }
}
