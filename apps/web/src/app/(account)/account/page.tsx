import { formatUkMobile } from '@repo/core/phone';
import { formatDate, formatDateTime } from '@repo/core/time';
import { Button } from '@repo/ui/button';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { ListDivider, ListRow } from '@repo/ui/list-row';
import { SkeletonRow } from '@repo/ui/skeleton';
import { StatusPill } from '@repo/ui/status-pill';
import { ChevronLeft } from 'lucide-react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { landingPath, requiresMfa } from '@/lib/auth/portals';
import { requireAccess } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { describeUserAgent } from '@/lib/user-agent';
import { signOut } from '../../(auth)/actions';
import { signOutEverywhere } from './actions';
import { DeleteAccount, RevokeDeviceButton } from './account-client';

export const metadata: Metadata = { title: 'Account and security', robots: { index: false } };

export default function AccountPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-2 pt-8" aria-busy>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      }
    >
      <AccountContent />
    </Suspense>
  );
}

async function AccountContent() {
  const { session, access } = await requireAccess();
  const supabase = await createSupabaseServerClient();
  const [{ data: profile }, { data: sessions }, { data: factors }, { data: deletion }] = await Promise.all([
    supabase.from('users').select('full_name, email, phone, phone_verified_at').eq('id', session.userId).single(),
    supabase.rpc('list_my_sessions'),
    supabase.auth.mfa.listFactors(),
    supabase.from('deletion_requests').select('requested_at').in('status', ['pending', 'processing']).maybeSingle(),
  ]);
  // listFactors().totp only ever contains verified factors.
  const totpOn = (factors?.totp.length ?? 0) > 0;
  const mfaRequired = requiresMfa(access);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={landingPath(access) as Route}
        className="-ml-3 flex h-12 w-fit items-center gap-1 rounded-full px-3 text-body font-medium text-ink hover:bg-grey-100"
      >
        <ChevronLeft size={20} strokeWidth={1.5} aria-hidden />
        Back
      </Link>
      <h1 className="text-h1 text-black">Account and security</h1>

      <Card padding="none" role="region" aria-labelledby="details-title">
        <div className="px-4 pt-4">
          <CardTitle id="details-title">Your details</CardTitle>
        </div>
        <ListRow title="Name" subtitle={profile?.full_name || 'Not set'} />
        <ListDivider />
        <ListRow title="Email" subtitle={profile?.email ?? session.email ?? 'Not set'} />
        <ListDivider />
        <ListRow
          title="Mobile"
          subtitle={profile?.phone ? formatUkMobile(`+${profile.phone.replace(/^\+/, '')}`) : 'Not added'}
          trailing={
            profile?.phone_verified_at ? (
              <StatusPill status="confirmed">Verified</StatusPill>
            ) : (
              <Link href="/verify-phone?next=/account" className="text-small font-semibold text-blue underline underline-offset-4">
                Add and verify
              </Link>
            )
          }
        />
      </Card>

      <Card padding="none" role="region" aria-labelledby="signing-in-title">
        <div className="px-4 pt-4">
          <CardTitle id="signing-in-title">Signing in</CardTitle>
        </div>
        <ListRow asChild title="Password" subtitle="Change your password" chevron>
          <Link href="/account/password" aria-label="Change your password" />
        </ListRow>
        <ListDivider />
        <ListRow
          title="Two-step verification"
          subtitle={mfaRequired ? 'Required for your role' : 'An extra step with an authenticator app'}
          trailing={
            totpOn ? (
              <StatusPill status="confirmed">On</StatusPill>
            ) : (
              <Link href="/mfa?next=/account" className="text-small font-semibold text-blue underline underline-offset-4">
                Set up
              </Link>
            )
          }
        />
      </Card>

      <Card padding="none" role="region" aria-labelledby="devices-title">
        <div className="px-4 pt-4 pb-2">
          <CardTitle id="devices-title">Devices</CardTitle>
          <CardDescription>Where you are signed in.</CardDescription>
        </div>
        {(sessions ?? []).map((device, index) => {
          const name = describeUserAgent(device.user_agent);
          const lastActive = formatDateTime(new Date(device.last_active_at));
          return (
            <div key={device.id}>
              {index > 0 ? <ListDivider /> : null}
              <ListRow
                title={name}
                subtitle={`Last active ${lastActive}`}
                trailing={
                  device.is_current ? (
                    <StatusPill status="pending">This device</StatusPill>
                  ) : (
                    <RevokeDeviceButton sessionId={device.id} device={`${name}, last active ${lastActive}`} />
                  )
                }
              />
            </div>
          );
        })}
        <div className="border-t border-grey-200 p-4">
          <form action={signOutEverywhere}>
            <Button type="submit" variant="secondary" width="responsive">
              Sign out of all devices
            </Button>
          </form>
        </div>
      </Card>

      <Card role="region" aria-labelledby="data-title">
        <CardTitle id="data-title">Your data</CardTitle>
        <CardDescription className="mt-1">
          Everything we hold about you, to read, print or keep as a file (NFR-PRV-03).
        </CardDescription>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button variant="secondary" asChild>
            <Link href="/account/data">See your data</Link>
          </Button>
          <Button variant="secondary" asChild>
            <a href="/account/data.json" download>
              Download as JSON
            </a>
          </Button>
        </div>
      </Card>

      <Card role="region" aria-labelledby="delete-title">
        <CardTitle id="delete-title">Delete your account</CardTitle>
        <CardDescription className="mt-1">
          We delete your details and keep payment records for 6 years, as the law requires.
        </CardDescription>
        <div className="mt-4">
          {deletion ? (
            <p className="text-small font-medium text-ink">We received your request on {formatDate(new Date(deletion.requested_at))}.</p>
          ) : (
            <DeleteAccount />
          )}
        </div>
      </Card>

      <form action={signOut.bind(null, 'local')}>
        <Button type="submit" variant="tertiary" className="px-0">
          Sign out
        </Button>
      </form>
    </div>
  );
}
