'use client';

import { passBannerWords } from '@repo/core/gallery';
import { Button } from '@repo/ui/button';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { EmptyState } from '@repo/ui/empty-state';
import { StatusPill } from '@repo/ui/status-pill';
import { toast } from '@repo/ui/toast';
import { BadgeCheck, Eye, EyeOff, Images, Undo2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import type { AdminGalleryPhoto } from '@/lib/admin/gallery';
import { galleryUrl } from '@/lib/storage/images';
import { checkGalleryPhoto, hideGalleryPhoto } from './actions';

/** One photo, with the two things staff decide about it: the tick, and whether it is shown. */
function Photo({ photo }: { photo: AdminGalleryPhoto }) {
  const [verified, setVerified] = useState(photo.verified);
  const [hidden, setHidden] = useState(photo.hidden);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const words = passBannerWords({
    learnerName: photo.learnerName,
    passedOn: photo.passedOnDate,
    businessName: photo.businessName,
  });

  const tick = (next: boolean) => {
    setError(null);
    startTransition(async () => {
      const result = await checkGalleryPhoto({ photoId: photo.id, verified: next });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setVerified(next);
      toast(next ? 'Ticked' : 'Tick taken back');
    });
  };

  const hide = (next: boolean) => {
    setError(null);
    startTransition(async () => {
      const result = await hideGalleryPhoto({ photoId: photo.id, hidden: next });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setHidden(next);
      // Taking one down takes the tick with it, which the database does.
      if (next) setVerified(false);
      toast(next ? 'Taken off the public page' : 'Back on the public page');
    });
  };

  return (
    <Card className="flex flex-col gap-4" role="region" aria-labelledby={`photo-${photo.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <CardTitle id={`photo-${photo.id}`}>{photo.learnerName}</CardTitle>
          <CardDescription>
            {[
              photo.businessName,
              photo.businessKind,
              photo.instructorName,
              photo.fromTheList ? 'From their learner list' : 'Name typed in',
            ]
              .filter((part) => part !== null)
              .join(' · ')}
          </CardDescription>
        </div>
        <StatusPill status={hidden ? 'cancelled' : verified ? 'completed' : 'attention'}>
          {hidden ? 'Taken down' : verified ? 'Verified' : 'Not checked'}
        </StatusPill>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={galleryUrl(photo.imagePath)}
        alt={words}
        loading="lazy"
        decoding="async"
        className="aspect-[4/3] w-full rounded-card bg-grey-100 object-cover"
      />
      <p className="text-small text-grey-700">
        Passed {photo.passedOn}. Added {photo.added}.
      </p>

      {error ? <FormAlert>{error}</FormAlert> : null}

      <div className="flex flex-wrap gap-2">
        {hidden ? null : (
          <Button variant={verified ? 'secondary' : 'primary'} pending={pending} onClick={() => { tick(!verified); }}>
            {verified ? <Undo2 className="size-5" aria-hidden /> : <BadgeCheck className="size-5" aria-hidden />}
            <span>
              {verified ? 'Take the tick back' : 'Verify'}
              <span className="sr-only"> {photo.learnerName}</span>
            </span>
          </Button>
        )}
        <Button variant="secondary" pending={pending} onClick={() => { hide(!hidden); }}>
          {hidden ? <Eye className="size-5" aria-hidden /> : <EyeOff className="size-5" aria-hidden />}
          <span>
            {hidden ? 'Put it back' : 'Take it down'}
            <span className="sr-only"> {photo.learnerName}</span>
          </span>
        </Button>
      </div>
    </Card>
  );
}

/** D-218: every Business wall, newest first, for the staff who check them. */
export function GalleryScreen({ photos }: { photos: AdminGalleryPhoto[] }) {
  if (photos.length === 0) {
    return <EmptyState icon={Images} title="Nothing here" description="No pass photos match what you are looking at." />;
  }
  return (
    <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {photos.map((photo) => (
        <li key={photo.id}>
          <Photo photo={photo} />
        </li>
      ))}
    </ul>
  );
}
