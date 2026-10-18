'use client';

import { isFlagEnabled, type FlagOverrides } from '@repo/config/flags';
import { Button } from '@repo/ui/button';
import { useEffect, useRef, useState } from 'react';
import { FormAlert } from '@/components/form-alert';
import { clientEnv } from '@/env/client';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';

/**
 * Google's official four-colour mark, required by its sign-in branding guidelines. These
 * colours belong to Google's logo, not our design tokens, so they are the one sanctioned
 * exception to "no raw colour values in components".
 */
function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/**
 * Continue with Google (AUTH-01), whatever this environment has switched on: the design page
 * shows it everywhere, and `OAuthButtons` decides where else it appears.
 *
 * Somebody who leaves for Google and comes back with the browser's back button without signing
 * in can be shown this page exactly as they left it, which phones above all do (D-272): the button
 * still turning, and the forms under it failing until the page is loaded again. So a page brought
 * back that way, after leaving for Google, loads itself again at once.
 */
export function GoogleButton({ next }: { next: string }) {
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const leftForGoogle = useRef(false);

  useEffect(() => {
    const cameBack = (event: PageTransitionEvent) => {
      if (event.persisted && leftForGoogle.current) window.location.reload();
    };
    window.addEventListener('pageshow', cameBack);
    return () => {
      window.removeEventListener('pageshow', cameBack);
    };
  }, []);

  return (
    <>
      {problem ? <FormAlert>{problem}</FormAlert> : null}
      <Button
        variant="secondary"
        width="full"
        pending={pending}
        onClick={() => {
          setProblem(null);
          setPending(true);
          leftForGoogle.current = true;
          const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
          void getSupabaseBrowserClient()
            .auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })
            .then(({ error }) => {
              // Nothing left for Google: the button stops turning rather than turning for ever.
              if (!error) return;
              leftForGoogle.current = false;
              setPending(false);
              setProblem('We could not reach Google. Try again, or use your email below.');
            });
        }}
      >
        {pending ? null : <GoogleMark />}
        Continue with Google
      </Button>
    </>
  );
}

/**
 * Google (and later Apple) sign-in (AUTH-01). Shown only when the provider is configured
 * for this environment and a super admin has not switched it off (ADM-05); Apple stays hidden
 * until its keys exist.
 */
export function OAuthButtons({ next, flags }: { next: string; flags: FlagOverrides }) {
  const google = clientEnv.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED && isFlagEnabled('googleSignIn', flags);
  if (!google) return null;

  return (
    <div className="flex flex-col gap-3">
      <GoogleButton next={next} />
      <div className="flex items-center gap-3 text-small text-grey-700" aria-hidden>
        <span className="h-px flex-1 bg-grey-200" />
        or
        <span className="h-px flex-1 bg-grey-200" />
      </div>
    </div>
  );
}
