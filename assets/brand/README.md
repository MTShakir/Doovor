# Logo files

The masters for the logo, received 12 October 2026 and exported from Illustrator. Every favicon,
app icon, email header and share image is made from these, so nothing else needs exporting.

The logo is a steering wheel and the name, **doovor** in lower case, beside the wheel or under
it. It is black, or white on dark backgrounds, with no other colours. The tagline is
**Drive Starts Here.**

## The files

| File | What it is | Proportions |
|---|---|---|
| `logo-horizontal.svg` | Wheel on the left, name on the right. Black on a transparent background | 316.7 x 87.4, about 3.6 to 1 |
| `logo-horizontal-white.svg` | The same in white, for dark backgrounds | 316.7 x 87.4 |
| `logo-stacked.svg` | Wheel above the name. Black on a transparent background | 253.7 x 174.1, about 1.5 to 1 |
| `logo-stacked-white.svg` | The same in white | 253.7 x 174.1 |
| `logo-tagline.svg` | The horizontal logo with "Drive Starts Here." under the name, ranged right, in the same frame | 316.7 x 87.4 |
| `logo-tagline-white.svg` | The same in white | 316.7 x 87.4 |
| `icon.svg` | The wheel alone. Black on a transparent background | 110.8 x 110.9, square |
| `app-icon.svg` | The white wheel on a black square that fills the frame, corners left square | 270.2 x 270.2, square |

An SVG has no size in pixels. The numbers are its proportions, and it is drawn sharp at any size.

## Checked on arrival

All eight passed on 12 October 2026:

- Text is outlines: no fonts and no live text.
- Shapes only: no pictures inside, no scripts, no links to other files, no editing data.
- Each is cropped to its artwork, except `app-icon.svg`, which fills its square by design.
- Each white file is the same artwork as its black one.
- The wheel in `app-icon.svg` is centred and fills 77% of the square. That is inside the circle,
  80% across, that stays visible whatever shape Android crops an installed app's icon to, and
  phones round the square corners themselves.

## Using them

- Black files on light backgrounds; white files on black or on photographs.
- The tagline is under a tenth of the lockup's height, so `logo-tagline` is for when the logo is
  at least 380 px wide, where the tagline comes out about 10 px tall. Smaller than that, use
  `logo-horizontal`.
- `logo-horizontal` suits headers and `logo-stacked` suits square spaces.
- The black files set no colour of their own. As an image they are black; placed inline in a
  page, CSS `fill` can colour them.

## Replacing a file

Export the new one under the same name, keeping to what made these pass:

1. **Text turned into outlines.**
2. **No pictures inside the SVG.**
3. **Colours in RGB or hex,** not CMYK.
4. **The artboard cropped to the artwork,** except `app-icon.svg`, which is the whole square with
   the wheel inside the middle 80%.
5. **Exported as a plain SVG** ("SVG", not "Illustrator SVG" with editing data).

If the logo ever gains a colour beyond black and white, send its hex value too, so the app's
colours can match it.

## What gets made from these

None of this is made yet. It comes next, from the files above, with nothing else to export.

| Made | From | Size | Where it shows |
|---|---|---|---|
| Favicon | `app-icon.svg` | 16, 32 and 48 px, plus an SVG one | The browser tab. White on black shows in light and dark tabs alike |
| App icons | `app-icon.svg` | 192 and 512 px, and a 512 px one Android can crop to a circle | Installing the app on Android and a computer |
| Apple icon | `app-icon.svg` | 180 px | Adding the app to an iPhone home screen |
| Email header | `logo-horizontal.svg` | 2x the size it is shown | The top of every email (email clients cannot show SVG) |
| Share images | `logo-tagline-white.svg` | 1200 x 630 px | The preview when a page is shared on WhatsApp, Facebook, LinkedIn or X |
| Headers | `logo-horizontal.svg` and its white version | from the SVGs | The site, the app on a phone and a computer, sign-in, and onboarding |
