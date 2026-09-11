import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Teach tailwind-merge the custom tokens in styles/theme.css. Without this it would read
// `text-h1` as a colour and drop `text-ink` when both are passed.
const merge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['display', 'h1', 'h2', 'h3', 'body', 'small', 'caption'],
      radius: ['input', 'card'],
      shadow: ['card', 'raised', 'sheet'],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs));
}
