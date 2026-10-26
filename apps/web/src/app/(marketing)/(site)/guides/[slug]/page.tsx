import { brand } from '@repo/config/brand';
import {
  audienceLabels,
  guideBlocks,
  guideBySlug,
  guideCard,
  guideDate,
  guideGeoTags,
  guideOutline,
  guidePath,
  guidePictures,
  guides,
  guidesPath,
  guideStructuredData,
  relatedGuides,
  type Guide,
} from '@repo/core/guides';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { guideImages } from '@/components/guides/guide-images';
import { GuideBody, GuideByline, GuideCard, GuideOutline, GuidePlaces, GuideSources, GuideTakeaways } from '@/components/guides/guide-parts';
import { JsonLdScript } from '@/components/public/json-ld';
import { Breadcrumbs } from '@/components/public/place-links';
import { ClosingCall, PrimaryLink, QuestionList } from '@/components/site/marketing';
import { getAppUrl } from '@/lib/app-url';
import { publicPageMetadata, shareImageUrl } from '@/lib/public/metadata';
import { getSiteUrl } from '@/lib/site-url';

type Props = PageProps<'/guides/[slug]'>;

/** Every guide is built with the site: they are written in the code, so all of them are known. */
export function generateStaticParams() {
  return guides.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const guide = guideBySlug((await params).slug);
  if (guide === undefined) return {};
  return {
    ...publicPageMetadata({
      title: guide.title,
      description: guide.description,
      path: guidePath(guide.slug),
      indexable: true,
      card: guideCard(guide),
    }),
    // What it answers, and where it applies, for the engines that still read them (D-387).
    keywords: [...guide.keywords],
    other: guideGeoTags(guide),
  };
}

/** What a reader of each audience is offered at the end. */
function closingFor(guide: Guide, appUrl: string): { title: string; description: string; label: string; href: string } {
  switch (guide.audience) {
    case 'instructors':
      return {
        title: 'Your books, kept as you teach',
        description: `${brand.name} records every lesson payment as it happens, keeps your expenses with their receipts, and exports your tax year for your accountant.`,
        label: 'Create your free account',
        href: `${appUrl}/sign-up?role=instructor`,
      };
    case 'schools':
      return {
        title: 'Run your whole school in one place',
        description: 'Every instructor’s diary, learner allocation, school prices and payments, with the week at a glance.',
        label: 'Set up your school',
        href: `${appUrl}/sign-up?role=school`,
      };
    case 'learners':
      return {
        title: 'Book, pay and see your progress',
        description: `Book lessons with your instructor, pay in the app and see how you are doing after every lesson, on ${brand.name}.`,
        label: 'Create a learner account',
        href: `${appUrl}/sign-up?role=learner`,
      };
  }
}

export default async function GuidePage({ params }: Props) {
  const guide = guideBySlug((await params).slug);
  if (guide === undefined) notFound();

  const site = getSiteUrl();
  const blocks = guideBlocks(guide);
  const outline = guideOutline(blocks);
  const related = relatedGuides(guide);
  const closing = closingFor(guide, getAppUrl());
  const structured = guideStructuredData(guide, {
    url: site,
    imageUrl: shareImageUrl(guidePath(guide.slug), guideCard(guide)),
    pictures: guidePictures(blocks).map((picture) => ({ key: picture.key, url: `${site}${guideImages[picture.key].src}` })),
  });

  return (
    <>
      <JsonLdScript data={structured} />
      <article className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 pt-8 pb-14 md:px-6 md:pt-12">
        <Breadcrumbs
          crumbs={[
            { name: brand.name, href: '/' },
            { name: 'Guides', href: guidesPath },
            { name: guide.title, href: guidePath(guide.slug) },
          ]}
        />
        <header className="flex flex-col gap-4">
          <p className="text-small font-semibold text-grey-700">{audienceLabels[guide.audience]}</p>
          <h1 className="text-display text-balance text-black">{guide.title}</h1>
          <p className="text-h3 font-normal text-pretty text-grey-700">{guide.summary}</p>
          <GuideByline guide={guide} />
          <GuidePlaces places={guide.places} />
        </header>

        <GuideTakeaways takeaways={guide.takeaways} />
        <GuideOutline outline={outline} />
        <GuideBody blocks={blocks} />

        <section aria-labelledby="guide-questions" className="flex flex-col gap-6 border-t border-grey-200 pt-8">
          <h2 id="guide-questions" className="text-h2 text-black">
            Questions
          </h2>
          <QuestionList questions={guide.questions} />
        </section>

        <section aria-labelledby="guide-sources" className="flex flex-col gap-4 border-t border-grey-200 pt-8">
          <h2 id="guide-sources" className="text-h2 text-black">
            Where this comes from
          </h2>
          <p className="text-body text-grey-700">Checked against these pages on {guideDate(guide.updated)}.</p>
          <GuideSources sources={guide.sources} />
        </section>

        {related.length === 0 ? null : (
          <section aria-labelledby="guide-related" className="flex flex-col gap-4 border-t border-grey-200 pt-8">
            <h2 id="guide-related" className="text-h2 text-black">
              Read next
            </h2>
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-4">
              {related.map((next) => (
                <li key={next.slug}>
                  <GuideCard guide={next} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>

      <ClosingCall
        title={closing.title}
        description={closing.description}
        action={
          <PrimaryLink href={closing.href} onDark>
            {closing.label}
          </PrimaryLink>
        }
      />
    </>
  );
}
