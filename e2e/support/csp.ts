import { expect, type Page } from '@playwright/test';

/**
 * Watches for anything the content security policy refuses (M6-04, D-138). The policy is enforced,
 * so a refusal is a broken page: a script that never runs, a frame that never opens, a request that
 * never leaves. Returns the list, which fills as the page loads; read it with `expectNothingRefused`.
 *
 * The browser writes every refusal to the console, and the page reports its own once the listener
 * below is in place. Call this before the first navigation to have both.
 */
export function watchForRefusals(page: Page): string[] {
  const refusals: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (/content security policy|refused to (load|connect|execute|apply|frame|run)/i.test(text)) refusals.push(text);
  });
  void page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (violation) => {
      // Where it came from and what it was: without these, "refused eval" names no culprit.
      const where = violation.sourceFile ? ` from ${violation.sourceFile}:${String(violation.lineNumber)}` : '';
      const what = violation.sample ? ` (${violation.sample})` : '';
      console.error(`Content Security Policy: ${violation.violatedDirective} refused ${violation.blockedURI}${where}${what}`);
    });
  });
  return refusals;
}

export function expectNothingRefused(refusals: string[], where: string): void {
  expect(refusals, `${where} needed something the policy refuses`).toEqual([]);
}
