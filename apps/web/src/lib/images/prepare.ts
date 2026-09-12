'use client';

import { avatarImage, badgeImage, centreCrop, fitWithin, isAcceptedImageType } from '@repo/core/images';

/** Why a picture was refused. The pickers turn these into copy. */
export type ImageProblem = 'WRONG_TYPE' | 'TOO_BIG' | 'UNREADABLE';

export type PreparedImage = { ok: true; blob: Blob } | { ok: false; problem: ImageProblem };

interface Target {
  outputType: string;
  outputQuality: number;
  maxInputBytes: number;
  maxOutputBytes: number;
}

/**
 * Decodes, redraws and re-encodes a picture (M1-03, M1-04).
 *
 * Re-encoding is what removes the camera metadata. A photo taken at home carries the GPS
 * position of that home, so the original bytes never leave the browser. The orientation is
 * read from the file before the metadata goes, so a picture taken in portrait is not stored
 * on its side.
 */
async function prepare(
  file: File,
  target: Target,
  frame: (picture: ImageBitmap) => { canvas: HTMLCanvasElement; draw: (context: CanvasRenderingContext2D) => void },
): Promise<PreparedImage> {
  if (!isAcceptedImageType(file.type)) return { ok: false, problem: 'WRONG_TYPE' };
  if (file.size > target.maxInputBytes) return { ok: false, problem: 'TOO_BIG' };

  let picture: ImageBitmap;
  try {
    picture = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return { ok: false, problem: 'UNREADABLE' };
  }

  try {
    const { canvas, draw } = frame(picture);
    const context = canvas.getContext('2d');
    if (!context) return { ok: false, problem: 'UNREADABLE' };
    draw(context);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, target.outputType, target.outputQuality);
    });
    if (!blob) return { ok: false, problem: 'UNREADABLE' };
    if (blob.size > target.maxOutputBytes) return { ok: false, problem: 'TOO_BIG' };
    return { ok: true, blob };
  } finally {
    picture.close();
  }
}

/** A profile picture: the middle square, at the avatar size. */
export function prepareAvatar(file: File): Promise<PreparedImage> {
  return prepare(file, avatarImage, (picture) => {
    const crop = centreCrop(picture.width, picture.height);
    const canvas = document.createElement('canvas');
    canvas.width = crop.size;
    canvas.height = crop.size;
    return {
      canvas,
      draw: (context) => {
        context.drawImage(picture, crop.x, crop.y, crop.side, crop.side, 0, 0, crop.size, crop.size);
      },
    };
  });
}

/** A badge photo: the whole picture, scaled down only far enough to stay readable. */
export function prepareBadge(file: File): Promise<PreparedImage> {
  return prepare(file, badgeImage, (picture) => {
    const size = fitWithin(picture.width, picture.height);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    return {
      canvas,
      draw: (context) => {
        context.drawImage(picture, 0, 0, size.width, size.height);
      },
    };
  });
}
