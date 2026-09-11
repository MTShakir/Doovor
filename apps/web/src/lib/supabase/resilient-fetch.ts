/**
 * PostgREST can reject a freshly issued token with PGRST303 "JWT issued at future" when its
 * cached clock goes stale (upstream bug, supabase discussion 48123; D-037). The token is
 * valid, so retrying after a short pause succeeds. Only that error on REST calls is retried.
 */
const MAX_ATTEMPTS = 3;

async function isIssuedAtFuture(response: Response): Promise<boolean> {
  if (response.status !== 401) return false;
  try {
    const body = (await response.clone().json()) as { code?: string };
    return body.code === 'PGRST303';
  } catch {
    return false;
  }
}

export function createResilientFetch(baseFetch: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const isRest = url.includes('/rest/v1/');
    let response = await baseFetch(input, init);
    for (let attempt = 1; isRest && attempt < MAX_ATTEMPTS && (await isIssuedAtFuture(response)); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
      response = await baseFetch(input, init);
    }
    return response;
  };
}

export const resilientFetch = createResilientFetch();
