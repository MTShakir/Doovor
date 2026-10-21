import type { Metadata, Route } from 'next';
import { brand } from '@repo/config/brand';
import { Button } from '@repo/ui/button';
import { Skeleton } from '@repo/ui/skeleton';
import Link from 'next/link';
import { Suspense } from 'react';
import { FormAlert } from '@/components/form-alert';
import { landingPath } from '@/lib/auth/portals';
import { getAccess } from '@/lib/auth/session';
import { redirectTo } from '@/lib/redirect-to';
import { ownBusiness } from '@/lib/school/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AcceptButton } from './accept-button';
import { JoinButton } from './join-button';
import { LinkButton } from './link-button';

export const metadata: Metadata = { title: 'Your invitation' };

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <Invitation params={params} />
    </Suspense>
  );
}

/** The name and email an invitation already knows, so nothing is retyped on a phone. */
function signUpLink(role: 'learner' | 'instructor', details: { full_name: string | null; email: string | null }): { href: string; prefilled: boolean } {
  const query = new URLSearchParams({ role });
  if (details.full_name) query.set('name', details.full_name);
  if (details.email) query.set('email', details.email);
  return { href: `/sign-up?${query.toString()}`, prefilled: query.has('name') || query.has('email') };
}

function SignInInstead() {
  return (
    <p className="text-body text-ink">
      Already have an account?{' '}
      <Link href="/sign-in" className="font-semibold text-blue underline underline-offset-4">
        Sign in
      </Link>
    </p>
  );
}

/** AUTH-07 and AUTH-05: what an invitation link opens, signed in or not. */
async function Invitation({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc('invitation_details', { p_token: token }).maybeSingle();

  if (!data) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-h1 text-black">This link does not work</h1>
        <p className="text-body text-grey-700">
          Ask whoever sent it to send you a new one. Links stop working once they have been used.
        </p>
        <Button asChild width="responsive">
          <Link href="/">Go to the home page</Link>
        </Button>
      </div>
    );
  }

  const who = data.instructor_name;

  if (data.expired) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-h1 text-black">This link has expired</h1>
        <p className="text-body text-grey-700">Ask {who} to send you a new one. They take a few seconds to make.</p>
      </div>
    );
  }

  if (data.kind === 'member') {
    return <SchoolInvitation token={token} details={data} />;
  }
  if (data.kind === 'link') {
    return <LinkInvitation token={token} details={data} />;
  }

  const access = await getAccess();
  if (access?.access.isLearner) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-h1 text-black">{who} would like to teach you</h1>
        <p className="text-body text-grey-700">Accept and you will be able to book lessons with them.</p>
        <AcceptButton token={token} name={who} />
      </div>
    );
  }
  if (access) {
    // Signed in as somebody who is not a learner: an invitation is not theirs to accept.
    redirectTo('/');
  }

  // Signed out. The proxy has kept the token for after the account exists, so this only has
  // to pre-fill what the invitation already knows.
  const signUp = signUpLink('learner', data);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-h1 text-black">{who} would like to teach you</h1>
      <p className="text-body text-grey-700">
        Create your account and you will land linked to {who}, ready to book your first lesson.
      </p>
      {signUp.prefilled ? <FormAlert tone="success">Your details are already filled in. It takes a minute.</FormAlert> : null}
      <Button asChild width="responsive" size="lg">
        <Link href={signUp.href as Route}>Create my account</Link>
      </Button>
      <SignInInstead />
    </div>
  );
}

/** AUTH-05: an instructor invited to teach for a school. */
async function SchoolInvitation({
  token,
  details,
}: {
  token: string;
  details: { business_name: string; full_name: string | null; email: string | null; already_member: boolean; role?: string | null };
}) {
  const school = details.business_name;
  // A manager helps run the school, and teaches nowhere because of it (D-293).
  const managing = details.role === 'manager';
  const heading = managing ? `${school} would like you to help run it` : `${school} would like you to teach with them`;
  const access = await getAccess();

  if (access && details.already_member) {
    // Usually the owner, checking the link they are about to send.
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-h1 text-black">You are already part of {school}</h1>
        <p className="text-body text-grey-700">
          This link is for the instructor you are inviting. Send it to them: it works once, for whoever opens it first.
        </p>
        <Button asChild width="responsive">
          <Link href={landingPath(access.access) as Route}>Go to my account</Link>
        </Button>
      </div>
    );
  }

  if (access && managing) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-h1 text-black">{heading}</h1>
        <p className="text-body text-grey-700">
          As a manager you look after its instructors, bookings, prices and learners. You see its revenue if the owner lets you.
        </p>
        <JoinButton token={token} school={school} />
      </div>
    );
  }

  if (access) {
    const teaching = access.access.memberships.find((membership) => membership.instructorProfileId !== null);
    // A business of their own pauses while they teach under the school (D-292).
    if (teaching?.businessType === 'independent' && teaching.role === 'owner') {
      return (
        <div className="flex flex-col gap-4">
          <h1 className="text-h1 text-black">{heading}</h1>
          <p className="text-body text-grey-700">
            Joining pauses {teaching.businessName} while you teach under {school}: its profile and booking link go offline, and each of
            your learners is asked whether to move to {school} with you. Leave {school} later and you can open it again.
          </p>
          <p className="text-body text-grey-700">
            It can pause with no lessons still to come and no learner with hours left to use. To keep your own business instead, ask{' '}
            {school} to link it.
          </p>
          <JoinButton token={token} school={school} />
        </div>
      );
    }
    if (teaching) {
      return (
        <div className="flex flex-col gap-4">
          <h1 className="text-h1 text-black">This account already teaches</h1>
          <p className="text-body text-grey-700">
            An account teaches for one driving business, and this one teaches for {teaching.businessName}. To join {school},
            sign out and create a new account with a different email.
          </p>
          <Button asChild width="responsive">
            <Link href={landingPath(access.access) as Route}>Go to my account</Link>
          </Button>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-h1 text-black">{heading}</h1>
        <p className="text-body text-grey-700">Join and set up your instructor profile in four short steps.</p>
        <JoinButton token={token} school={school} />
      </div>
    );
  }

  // Signed out: the proxy has kept the token, and the account joins the school once it exists.
  const signUp = signUpLink('instructor', details);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-h1 text-black">{heading}</h1>
      <p className="text-body text-grey-700">
        {managing
          ? `Create your account to help run ${school}.`
          : `Create your account to join ${school}, then set up your instructor profile in four short steps.`}
      </p>
      {signUp.prefilled ? <FormAlert tone="success">Your details are already filled in. It takes a minute.</FormAlert> : null}
      <Button asChild width="responsive" size="lg">
        <Link href={signUp.href as Route}>Create my account</Link>
      </Button>
      <SignInInstead />
    </div>
  );
}

/** Whether the platform has checked this instructor's badge itself, so no school vouches for it (D-280). */
async function checkedByUs(profileId: string | null): Promise<boolean> {
  if (profileId === null) return false;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('instructor_profiles').select('verification_status, vouched_at').eq('id', profileId).maybeSingle();
  return data?.verification_status === 'approved' && data.vouched_at === null;
}

/**
 * What linking to a school means for the instructor, said before they agree to it (D-282). A school
 * vouches for a badge only where the platform has not checked it, so the line on the badge says
 * which, or says both for somebody not signed in yet (D-280, D-323).
 */
function WhatLinkingMeans({ school, checked }: { school: string; checked: boolean | null }) {
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5 text-body text-ink">
      <li>You keep your own prices, payments and learners.</li>
      <li>{school} sends you pupils and sees when you are free, never your money.</li>
      <li>
        {checked === true
          ? `${brand.name} has checked your badge, and your profile keeps its tick.`
          : checked === false
            ? `${school} vouches for your badge, so ${brand.name} does not check it while you are linked.`
            : `${school} vouches for your badge, unless ${brand.name} has checked it already.`}
      </li>
      <li>Your plan includes Pro while you are linked.</li>
      <li>You can leave whenever you like.</li>
    </ul>
  );
}

/** D-282: an instructor asked to link the business they run to a school. */
async function LinkInvitation({
  token,
  details,
}: {
  token: string;
  details: { business_name: string; full_name: string | null; email: string | null; already_member: boolean };
}) {
  const school = details.business_name;
  const heading = `${school} would like to send you pupils`;
  const access = await getAccess();

  if (access && details.already_member) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-h1 text-black">Your business is linked to {school}</h1>
        <p className="text-body text-grey-700">There is nothing more to do with this link.</p>
        <Button asChild width="responsive">
          <Link href="/app/instructor/school">See your school</Link>
        </Button>
      </div>
    );
  }

  if (access) {
    const own = ownBusiness(access.access.memberships);
    if (own) {
      const checked = await checkedByUs(own.instructorProfileId);
      return (
        <div className="flex flex-col gap-4">
          <h1 className="text-h1 text-black">{heading}</h1>
          <p className="text-body text-grey-700">Link {own.businessName} to {school}. Nothing moves, and nothing is lost.</p>
          <WhatLinkingMeans school={school} checked={checked} />
          <LinkButton token={token} business={own.businessName} school={school} />
        </div>
      );
    }
    // Somebody who teaches under a school, or does not teach: there is no business of theirs to link.
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-h1 text-black">This account has no business of its own to link</h1>
        <p className="text-body text-grey-700">
          {school} links instructors who run their own driving business. To link one, sign out and create an instructor account
          with a different email.
        </p>
        <Button asChild width="responsive">
          <Link href={landingPath(access.access) as Route}>Go to my account</Link>
        </Button>
      </div>
    );
  }

  // Signed out. A new account is linked as soon as its business exists; somebody who has one comes
  // back here once signed in, and says yes themselves.
  const signUp = signUpLink('instructor', details);
  const back = `/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-h1 text-black">{heading}</h1>
      <p className="text-body text-grey-700">
        Link your instructor business to {school}. New here? Create your account and it is linked as soon as your business is
        set up.
      </p>
      <WhatLinkingMeans school={school} checked={null} />
      {signUp.prefilled ? <FormAlert tone="success">Your details are already filled in. It takes a minute.</FormAlert> : null}
      <Button asChild width="responsive" size="lg">
        <Link href={signUp.href as Route}>Create my account</Link>
      </Button>
      <p className="text-body text-ink">
        Already have an account?{' '}
        <Link href={back as Route} className="font-semibold text-blue underline underline-offset-4">
          Sign in to link it
        </Link>
      </p>
    </div>
  );
}
