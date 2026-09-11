import { describe, expect, it } from 'vitest';
import { describeUserAgent } from './user-agent';

describe('describeUserAgent', () => {
  it.each([
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36', 'Chrome on Windows'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0', 'Edge on Windows'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1', 'Safari on iPhone'],
    ['Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36', 'Chrome on Android'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:142.0) Gecko/20100101 Firefox/142.0', 'Firefox on Mac'],
  ])('labels %s', (ua, label) => {
    expect(describeUserAgent(ua)).toBe(label);
  });

  it('falls back gracefully', () => {
    expect(describeUserAgent(null)).toBe('Unknown device');
    expect(describeUserAgent('curl/8.0')).toBe('Unknown device');
  });
});
