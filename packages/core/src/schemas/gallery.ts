/**
 * Adding a pass photo (D-218).
 *
 * A learner is chosen from the list where they are on it, and typed where they are not: the photo
 * is taken on the day, and by then somebody who has passed is often already marked as passed or
 * gone. One of the two has to say who it is, which is what the refinement below is for.
 *
 * The tick is not optional. A named photograph of a person on a public page is theirs, and the
 * only thing standing between this and posting somebody's face without asking is the instructor
 * saying they asked.
 */

import { z } from '../zod';
import { isValidLocalDate } from '../time/calendar.ts';
import { todayInZone } from '../time/zone.ts';

/** One side of a prepared picture, in pixels. */
const pictureSide = z.number().int().min(1).max(10_000).nullable().default(null);

export const galleryPhotoSchema = z
  .object({
    /** Where the prepared picture was stored, as "<business id>/<file>". The server checks it. */
    imagePath: z.string().trim().min(1, { error: 'Choose a photo' }).max(200),
    /**
     * The prepared picture's width and height (D-267), so a page keeps the right room for it
     * before it loads. Null from a page opened before they were sent: that photo takes its shape
     * as it arrives instead.
     */
    imageWidth: pictureSide,
    imageHeight: pictureSide,
    passedOn: z
      .string()
      .trim()
      .refine(isValidLocalDate, { error: 'Enter the day they passed' })
      .refine((date) => date <= todayInZone(), { error: 'That day has not happened yet' }),
    learnerId: z
      .union([z.literal('').transform(() => null), z.uuid()])
      .nullable()
      .default(null),
    learnerName: z.string().trim().max(80, { error: 'Use 80 characters or fewer' }).default(''),
    /**
     * A tick, and nothing else will do. The same words whether it arrives unticked or does not
     * arrive at all: "expected boolean, received undefined" is not something to put in front of
     * an instructor.
     */
    consent: z
      .boolean({ error: 'Confirm you have their permission to show this' })
      .refine((agreed) => agreed, { error: 'Confirm you have their permission to show this' }),
  })
  .refine((one) => one.learnerId !== null || one.learnerName !== '', {
    error: 'Choose a learner, or type their name',
    path: ['learnerName'],
  })
  // Both or neither: a width on its own says nothing about the picture's shape.
  .refine((one) => (one.imageWidth === null) === (one.imageHeight === null), {
    error: 'Choose the photo again',
    path: ['imagePath'],
  });

export type GalleryPhotoInput = z.infer<typeof galleryPhotoSchema>;
