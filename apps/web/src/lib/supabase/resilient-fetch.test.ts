import { describe, expect, it, vi } from 'vitest';
import { createResilientFetch } from './resilient-fetch';

const issuedAtFuture = () =>
  new Response(JSON.stringify({ code: 'PGRST303', message: 'JWT issued at future' }), { status: 401 });
const okResponse = () => new Response('[]', { status: 200 });

describe('resilient fetch (D-037)', () => {
  it('retries a REST call rejected with PGRST303 and returns the retry', async () => {
    const base = vi.fn<typeof fetch>().mockResolvedValueOnce(issuedAtFuture()).mockResolvedValueOnce(okResponse());
    const response = await createResilientFetch(base)('http://127.0.0.1:54321/rest/v1/users?select=*');
    expect(response.status).toBe(200);
    expect(base).toHaveBeenCalledTimes(2);
  });

  it('gives up after three attempts', async () => {
    const base = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(issuedAtFuture()));
    const response = await createResilientFetch(base)('http://127.0.0.1:54321/rest/v1/users');
    expect(response.status).toBe(401);
    expect(base).toHaveBeenCalledTimes(3);
  });

  it('does not retry other errors or non-REST calls', async () => {
    const other = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ code: 'PGRST301' }), { status: 401 }));
    await createResilientFetch(other)('http://127.0.0.1:54321/rest/v1/users');
    expect(other).toHaveBeenCalledTimes(1);

    const auth = vi.fn<typeof fetch>().mockResolvedValue(issuedAtFuture());
    await createResilientFetch(auth)('http://127.0.0.1:54321/auth/v1/user');
    expect(auth).toHaveBeenCalledTimes(1);
  });
});
