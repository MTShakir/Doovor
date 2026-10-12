# Logo files

Drop the logo files in this folder with exactly these names. From them, every favicon, app icon,
email header and share image is made, so nothing else needs exporting.

The logo: an icon, and the name, which sits either beside the icon or under it.
The tagline: **Drive Starts Here**.

## The files

| File | What it is | Format and size |
|---|---|---|
| `logo-horizontal.svg` | Icon on the left, name on the right, full colour, transparent background | SVG, cropped tight to the artwork |
| `logo-horizontal-white.svg` | The same, entirely white, for black backgrounds | SVG, cropped tight |
| `logo-stacked.svg` | Icon above the name, full colour, transparent background | SVG, cropped tight |
| `icon.svg` | The icon alone, full colour, transparent background | SVG, square artboard, cropped tight |
| `app-icon.svg` | The icon as it should look on a phone's home screen: on its own background colour, filling the whole square, **no rounded corners** (phones round them), with the icon inside the middle 60% | SVG, **1024 x 1024** square |
| `logo-tagline.svg` *(optional)* | A lockup with "Drive Starts Here", if the designer has one | SVG, cropped tight |

**SVG is the one to send.** It stays sharp at every size and weighs a fraction of a picture.
If the designer can only send pictures, the same names ending `.png` are fine instead: transparent
background, at least 2000 pixels on the longest side, and `app-icon.png` at exactly 1024 x 1024.

## Before exporting

1. **Text turned into outlines.** No fonts and no live text in the file, or the name will be drawn
   in whatever font the viewer happens to have.
2. **No pictures inside the SVG.** Shapes only, nothing pasted in as an image.
3. **Colours in RGB or hex,** not CMYK.
4. **The artboard cropped to the artwork,** except `app-icon.svg`, which is the full 1024 square.
5. **Exported as a plain SVG** from Figma or Illustrator ("SVG", not "Illustrator SVG" with editing
   data).

If the logo uses colours other than black, white and the yellow `#FFD400`, send their hex values
too, so the app's colours can match the logo rather than sit beside it.

## What gets made from these

Nothing to export for any of this; it is all made from the files above.

| Made | Size | Where it shows |
|---|---|---|
| Favicon | 16, 32 and 48 px, plus an SVG one | The browser tab |
| App icons | 192 and 512 px, and a 512 px one Android can crop to a circle | Installing the app on Android and a computer |
| Apple icon | 180 px | Adding the app to an iPhone home screen |
| Email header | 2x the size it is shown | The top of every email (email clients cannot show SVG) |
| Share images | 1200 x 630 px | The preview when a page is shared on WhatsApp, Facebook, LinkedIn or X |
| Headers | from the SVGs | The site, the app on a phone and a computer, sign-in, and onboarding |
