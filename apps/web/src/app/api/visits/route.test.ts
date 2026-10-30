import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase/service', () => ({ getSupabaseServiceClient: () => ({ rpc }) }));
vi.mock('@/lib/app-url', () => ({ getAppUrl: () => 'https://app.example.com' }));

const { POST } = await import('./route');

const iphoneInstagram =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22G86 Instagram 389.0.0.29.87 (iPhone15,3; iOS 18_6; en_GB)';
const windowsEdge =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.2849.68';

function note(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://example.com/api/visits', {
    method: 'POST',
    headers: { origin: 'https://example.com', 'user-agent': windowsEdge, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const landing = { path: '/join', entry: true, landing: '/join', search: '?utm_source=card&utm_campaign=week1', referrer: '' };

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: true, error: null });
});

describe('counting a visit to the site (D-413)', () => {
  it('writes what the request says, and nothing about the person', async () => {
    const answer = await POST(note(landing, { 'x-vercel-ip-country': 'gb', 'x-vercel-ip-country-region': 'ENG', 'x-vercel-ip-city': 'Belvedere' }));

    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({ counted: true, tags: { source: 'card', medium: 'print', campaign: 'week1' } });
    expect(rpc).toHaveBeenCalledWith('system_record_visit', {
      p_path: '/join',
      p_entry: true,
      p_landing: '/join',
      p_channel: 'print',
      p_source: 'card',
      p_medium: '',
      p_campaign: 'week1',
      p_referrer: '',
      p_country: 'GB',
      p_region: 'ENG',
      p_city: 'Belvedere',
      p_device: 'computer',
      p_browser: 'Edge',
      p_system: 'Windows',
      p_app: '',
    });
  });

  it('knows a visit from inside an app, and the site a search came from', async () => {
    await POST(note({ ...landing, search: '', referrer: 'https://l.instagram.com/' }, { 'user-agent': iphoneInstagram }));
    expect(rpc).toHaveBeenLastCalledWith(
      'system_record_visit',
      expect.objectContaining({ p_channel: 'social', p_source: 'instagram', p_referrer: 'l.instagram.com', p_device: 'phone', p_browser: 'Instagram app', p_system: 'iOS', p_app: 'instagram' }),
    );

    const answer = await POST(note({ ...landing, search: '', referrer: 'https://www.google.co.uk/' }));
    expect(await answer.json()).toEqual({ counted: true, tags: { source: 'google', medium: 'search', campaign: null } });
  });

  it('takes a page of ours as no referrer, and a town written for an address as words', async () => {
    const answer = await POST(
      note({ path: '/pricing', entry: false, landing: null, search: '', referrer: 'https://www.example.com/join' }, { 'x-vercel-ip-city': 'St%20Albans' }),
    );
    expect(await answer.json()).toEqual({ counted: true, tags: { source: null, medium: null, campaign: null } });
    expect(rpc).toHaveBeenCalledWith(
      'system_record_visit',
      expect.objectContaining({ p_entry: false, p_landing: '', p_channel: 'direct', p_source: 'direct', p_referrer: '', p_city: 'St Albans' }),
    );
  });

  it('does not count programs, though it answers them', async () => {
    const answer = await POST(note(landing, { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' }));
    expect(await answer.json()).toEqual({ counted: false, tags: { source: 'card', medium: 'print', campaign: 'week1' } });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('turns away what is not a page of the site, from the site', async () => {
    expect((await POST(note({ ...landing, path: '/app/instructor', landing: null, entry: false }))).status).toBe(400);
    expect((await POST(note({ ...landing, path: '/join?email=x' }))).status).toBe(400);
    expect((await POST(note('not json'))).status).toBe(400);
    expect((await POST(note({ path: '/join' }))).status).toBe(400);
    expect((await POST(note('x'.repeat(9000)))).status).toBe(413);
    expect((await POST(note(landing, { origin: 'https://elsewhere.example.org' }))).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('never makes a visitor wait on a count that could not be written', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    rpc.mockResolvedValue({ data: null, error: { message: 'new row violates check constraint' } });
    const answer = await POST(note(landing));
    expect(answer.status).toBe(200);
    expect(await answer.json()).toMatchObject({ counted: false });
    expect(quiet).toHaveBeenCalledWith('Could not count a visit to /join: new row violates check constraint');
    quiet.mockRestore();
  });
});
