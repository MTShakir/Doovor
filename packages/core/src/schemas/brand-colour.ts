/**
 * An instructor's own colour on their booking page (D-210). Shared by the picker and the Server
 * Action, so the same rule decides both and the words somebody reads are written once.
 */

import { brandColourProblem, normaliseHexColour } from '../colour.ts';
import { z } from '../zod';

/** What to say about a colour nobody could read white writing on. */
export const contrastMessage =
  'That colour is too pale for white writing to read on. Try a darker one.';

export const brandColourInputSchema = z.object({
  businessId: z.uuid(),
  /** Empty puts the page back to the default, which is how somebody undoes it. */
  colour: z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      if (value === '') return;
      const problem = brandColourProblem(value);
      if (problem === 'format') {
        ctx.addIssue({ code: 'custom', message: 'Use a colour like #1A4D8F.' });
      } else if (problem === 'contrast') {
        ctx.addIssue({ code: 'custom', message: contrastMessage });
      }
    })
    .transform((value) => (value === '' ? '' : normaliseHexColour(value))),
});

export type BrandColourInput = z.input<typeof brandColourInputSchema>;
export type BrandColour = z.output<typeof brandColourInputSchema>;
