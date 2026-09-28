'use client';

import { Button } from '@repo/ui/button';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { toast } from '@repo/ui/toast';
import { EyeOff, Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { PassPhotoCard } from '@/components/gallery/pass-photo';
import type { OwnGalleryPhoto } from '@/lib/gallery/read';
import { removeGalleryPhoto } from '@/app/(portal)/app/instructor/gallery/actions';

/**
 * The Business own wall (D-218), as the public page draws it, with the two things that are only
 * its own business: which ones we have taken down, and the way to remove one.
 */
export function MyWall({
  photos,
  businessName,
  colour,
}: {
  photos: OwnGalleryPhoto[];
  businessName: string;
  colour: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [going, setGoing] = useState<string | null>(null);

  const remove = (photo: OwnGalleryPhoto) => {
    setGoing(photo.id);
    startTransition(async () => {
      const result = await removeGalleryPhoto({ photoId: photo.id });
      setGoing(null);
      toast(result.ok ? `${photo.learnerName} removed from your gallery` : result.message);
    });
  };

  if (photos.length === 0) {
    return (
      <Card className="flex flex-col gap-1" role="region" aria-labelledby="wall-title">
        <CardTitle id="wall-title">Your gallery</CardTitle>
        <CardDescription>
          Nothing here yet. The first photo you add appears on your public profile, with the name and the date on it.
        </CardDescription>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4" role="region" aria-labelledby="wall-title">
      <div className="flex flex-col gap-1">
        <CardTitle id="wall-title">Your gallery</CardTitle>
        <CardDescription>
          {photos.length === 1 ? '1 pass' : `${String(photos.length)} passes`}, newest first, as your profile shows them.
        </CardDescription>
      </div>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {photos.map((photo) => (
          <li key={photo.id} className="flex flex-col gap-2">
            <PassPhotoCard photo={photo} businessName={businessName} colour={colour} />
            {photo.hidden ? (
              // Only the Business sees this: on the public page the photo is simply not there.
              <p className="flex items-start gap-2 text-small text-grey-700">
                <EyeOff className="mt-0.5 size-4 shrink-0" aria-hidden />
                We have taken this one down. Get in touch if you think that is wrong.
              </p>
            ) : null}
            <Button
              variant="secondary"
              className="self-start"
              pending={pending && going === photo.id}
              onClick={() => { remove(photo); }}
            >
              <Trash2 className="size-5" aria-hidden />
              <span>
                Remove<span className="sr-only"> {photo.learnerName}</span>
              </span>
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
