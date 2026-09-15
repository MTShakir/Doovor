import { brand } from '@repo/config/brand';

const { colours } = brand;

/**
 * What a screen that needs a connection shows when there is none (PRD 8.1, M4-08).
 *
 * The service worker keeps this page when it installs, and answers with it for a screen it has no
 * copy of. It is plain HTML with its styles written in, rather than a page of the app, because it
 * has to stand on its own with nothing else on the device, and because the app's router would
 * move the address bar away from the screen that could not load. Try again is a link to the
 * address it is showing at, so it works with no script at all.
 */
export function offlinePage(): string {
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="${colours.black}">
<title>No connection | ${brand.name}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100dvh;display:flex;flex-direction:column;background:${colours.white};color:${colours.ink};font:16px/24px Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  header{padding:16px;font-size:18px;line-height:24px;font-weight:600;color:${colours.black}}
  main{flex:1;display:flex;flex-direction:column;gap:12px;width:100%;max-width:448px;margin:0 auto;padding:40px 16px}
  h1{margin:0;font-size:28px;line-height:34px;font-weight:700;color:${colours.black}}
  p{margin:0;color:${colours['grey-700']}}
  a.again{margin-top:12px;display:inline-flex;align-items:center;justify-content:center;height:48px;padding:0 24px;border-radius:9999px;background:${colours.black};color:${colours.white};font-weight:600;text-decoration:none}
  a.again:focus-visible{outline:2px solid ${colours.black};outline-offset:2px}
  @media (min-width:768px){header{padding:16px 32px}a.again{align-self:flex-start}}
</style>
</head>
<body>
<header>${brand.name}</header>
<main>
  <h1>No connection</h1>
  <p>This screen needs a signal to open. Today and the lessons on it open without one, once you have opened them with signal.</p>
  <a class="again" href="">Try again</a>
</main>
</body>
</html>`;
}
