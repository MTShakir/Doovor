import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { brand } from '@repo/config/brand';
import { describe, expect, it } from 'vitest';
import { authEmailCopy, authEmailKinds, authLink, authLinkHours, renderAuthTemplate } from './auth.tsx';

const root = join(import.meta.dirname, '..', '..', '..');
const hosted = join(root, 'ops', 'staging', 'supabase');
const templates = join(root, 'supabase', 'templates');

/** The subject Auth's settings give one template, read from a config.toml. */
function subjectIn(config: string, kind: string): string | undefined {
  const section = new RegExp(`\\[auth\\.email\\.template\\.${kind}\\]\\s*\\nsubject = "([^"]+)"\\s*\\ncontent_path = "([^"]+)"`).exec(config);
  return section?.[1];
}

function contentPathIn(config: string, kind: string): string | undefined {
  const section = new RegExp(`\\[auth\\.email\\.template\\.${kind}\\]\\s*\\nsubject = "[^"]+"\\s*\\ncontent_path = "([^"]+)"`).exec(config);
  return section?.[1];
}

/** Em dash and en dash: never in anything a person reads (CLAUDE.md rule 9). */
const DASHES = /[\u2013\u2014]/;

describe("Auth's own emails, rendered into its templates (AUTH-01, AUTH-02, D-258)", () => {
  for (const kind of authEmailKinds) {
    it(`keeps supabase/templates/${kind}.html up to date with this package (pnpm --filter @repo/emails test -u writes it)`, async () => {
      await expect(await renderAuthTemplate(kind)).toMatchFileSnapshot(join(templates, `${kind}.html`));
    });
  }

  it('makes the button the first link, with the fallback link written out after it', async () => {
    for (const kind of authEmailKinds) {
      const html = await renderAuthTemplate(kind);
      // The first thing to tap, which is what a person and the end to end tests follow. React puts a
      // preload for the logo in the head, which is a link of a kind, but not one to tap.
      const first = /<a\b[^>]*\bhref="([^"]+)"/.exec(html)?.[1]?.replaceAll('&amp;', '&');
      expect(first, kind).toBe(authLink(kind));
      expect(html, kind).toContain(authEmailCopy[kind].action);
      expect(html, kind).toContain('If the button does not work, copy this link into your browser:');
      // Written out as well as linked, so it can be copied.
      expect(html.split(authLink(kind).replaceAll('&', '&amp;')).length - 1, kind).toBe(3);
      expect(html, kind).not.toMatch(DASHES);
    }
  });

  it('signs off with the logo, the company that runs the product, the legal pages and where to get help', async () => {
    const html = await renderAuthTemplate('confirmation');
    // At the top and signing off, each as a tile and as the white logo a dark mail app shows (D-275).
    expect(html.match(new RegExp(`alt="${brand.name}"`, 'g'))).toHaveLength(4);
    expect(html).toContain(`${brand.name} is owned and run by ${brand.legalEntity}, registered in ${brand.company.registeredIn}`);
    expect(html).toContain(brand.company.number);
    expect(html).toContain(brand.company.registeredOffice);
    expect(html).toContain(brand.icoRegistration);
    expect(html).toContain(`mailto:${brand.supportEmail}`);
    for (const page of ['/privacy', '/terms', '/business-terms']) expect(html).toContain(`href="${brand.productionUrl}${page}"`);
  });

  it('is what the hosted settings and the local stack both read, under the same subjects', () => {
    const hostedConfig = readFileSync(join(hosted, 'config.toml'), 'utf8');
    const localConfig = readFileSync(join(root, 'supabase', 'config.toml'), 'utf8');
    for (const kind of authEmailKinds) {
      expect(subjectIn(hostedConfig, kind), kind).toBe(authEmailCopy[kind].subject);
      expect(subjectIn(localConfig, kind), kind).toBe(authEmailCopy[kind].subject);
      // A hosted push copies supabase/templates into ops/staging first (scripts/supabase.mjs).
      expect(contentPathIn(hostedConfig, kind), kind).toBe(`./supabase/templates/${kind}.html`);
      expect(contentPathIn(localConfig, kind), kind).toBe(`./supabase/templates/${kind}.html`);
    }
  });

  it('says the link lasts as long as Auth lets it', () => {
    for (const config of [join(hosted, 'config.toml'), join(root, 'supabase', 'config.toml')]) {
      const seconds = Number(/^otp_expiry = (\d+)$/m.exec(readFileSync(config, 'utf8'))?.[1]);
      expect(seconds, config).toBe(authLinkHours * 60 * 60);
    }
  });
});
