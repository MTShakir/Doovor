import { describe, expect, it } from 'vitest';
import { brand, companyDisclosure } from './brand';

describe('what the company says about itself (Companies Act trading disclosures, UK GDPR article 13)', () => {
  it('gives the four things a company website and email must show', () => {
    const said = companyDisclosure();
    for (const part of [brand.legalEntity, brand.company.registeredIn, brand.company.number, brand.company.registeredOffice]) {
      expect(said).toContain(part);
    }
  });

  it('holds a company number and an ICO registration in the shapes those registers use', () => {
    // Eight digits is a company registered in England and Wales; Scotland and Northern Ireland add letters.
    expect(brand.company.number).toMatch(/^\d{8}$/);
    expect(brand.company.registeredIn).toBe('England and Wales');
    expect(brand.icoRegistration).toMatch(/^Z[A-Z0-9]\d{6}$/);
  });
});

describe("the brand's own accounts (D-403)", () => {
  it('gives each a secure address on its own network, with its handle in it', () => {
    const hosts: Record<string, string> = {
      instagram: 'www.instagram.com',
      tiktok: 'www.tiktok.com',
      facebook: 'www.facebook.com',
      youtube: 'www.youtube.com',
      linkedin: 'www.linkedin.com',
      threads: 'www.threads.com',
    };
    expect(brand.social.map((one) => one.network)).toEqual(Object.keys(hosts));
    for (const one of brand.social) {
      const url = new URL(one.url);
      expect(url.protocol, one.network).toBe('https:');
      expect(url.host, one.network).toBe(hosts[one.network]);
      expect(url.pathname.toLowerCase(), one.network).toContain(one.handle.replace(/^@/, '').toLowerCase());
    }
  });
});
