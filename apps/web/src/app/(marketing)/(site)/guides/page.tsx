import { brand } from '@repo/config/brand';
import { audienceLabels, audienceOrder, guides, guidesPath } from '@repo/core/guides';
import { siteShareCard } from '@repo/core/share-card';
import type { Metadata } from 'next';
import { GuideCard } from '@/components/guides/guide-parts';
import { Band, ClosingCall, PrimaryLink } from '@/components/site/marketing';
import { getAppUrl } from '@/lib/app-url';
import { publicPageMetadata } from '@/lib/public/metadata';

/** Every guide, by who it is for (PRD 8.3, 14.6, D-255). */
export function generateMetadata(): Metadata {
  return publicPageMetadata({
    title: 'Guides for driving instructors and learners',
    description: `Plain answers on running a driving instructor business, choosing software and learning to drive, each fact sourced, by the ${brand.name} team.`,
    path: guidesPath,
    indexable: true,
    card: siteShareCard(brand.tagline),
    imagePath: '/',
  });
}

export default function GuidesPage() {
  const appUrl = getAppUrl();
  const groups = audienceOrder
    .map((audience) => ({ audience, list: guides.filter((guide) => guide.audience === audience) }))
    .filter((group) => group.list.length > 0);
  return (
    <>
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pt-10 pb-6 md:px-6 md:pt-20">
        <h1 className="text-display text-balance text-black md:text-hero">Guides</h1>
        <p className="max-w-2xl text-body text-pretty text-grey-700 md:text-h3 md:font-normal">
          Plain answers on running a driving instructor business, choosing the software for it and learning to drive. Every fact is checked against
          GOV.UK or the company it is about, and every guide says where.
        </p>
      </section>

      {groups.map((group) => (
        <Band key={group.audience} id={`guides-${group.audience}`} title={audienceLabels[group.audience]}>
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 lg:grid-cols-3">
            {group.list.map((guide) => (
              <li key={guide.slug}>
                <GuideCard guide={guide} />
              </li>
            ))}
          </ul>
        </Band>
      ))}

      <ClosingCall
        title="Less admin, more lessons"
        description="Your diary, payments, lesson records and tax year in one simple app."
        action={
          <PrimaryLink href={`${appUrl}/start`} onDark>
            Get started
          </PrimaryLink>
        }
      />
    </>
  );
}
