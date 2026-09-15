'use client';

import { bookingShareMessage, qrCode, qrSvg, whatsAppShareUrl } from '@repo/core/share';
import { Button } from '@repo/ui/button';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { toast } from '@repo/ui/toast';
import { Copy, Download, MessageCircle, Share2 } from 'lucide-react';
import { useId, useMemo } from 'react';

export interface BookingLinkCardProps {
  instructorName: string;
  /** The booking link, in full. Null while it takes no bookings, for the reason given. */
  bookingUrl: string | null;
  /** Why there is no link yet: the badge is still to be approved, or has run out (INS-03). */
  unavailable?: 'approval' | 'badge-expired';
  /** The public profile, in full, when there is one. */
  profileUrl: string | null;
}

function copy(text: string, done: string) {
  void navigator.clipboard.writeText(text).then(
    () => { toast(done); },
    () => { toast('Copy it from the box above'); },
  );
}

/**
 * PUB-03: the link an instructor shares, with the QR code for the car and printed cards, and
 * one tap to WhatsApp, Instagram or the clipboard (M5-05).
 *
 * Instagram takes no link from a web page, so on a phone the button opens the phone's own share
 * sheet, where Instagram is; anywhere else it copies the link to paste into a bio or story (D-112).
 */
export function BookingLinkCard({ instructorName, bookingUrl, profileUrl, unavailable = 'approval' }: BookingLinkCardProps) {
  const code = useMemo(() => (bookingUrl === null ? null : qrCode(bookingUrl)), [bookingUrl]);
  const titleId = useId();

  if (bookingUrl === null || code === null) {
    return (
      <Card className="flex flex-col gap-2" role="region" aria-labelledby={titleId}>
        <CardTitle id={titleId}>Your booking link</CardTitle>
        <CardDescription>
          {unavailable === 'badge-expired'
            ? 'Paused until your badge is renewed. Learners who open it are told you are not taking new bookings.'
            : 'Ready as soon as your badge is approved.'}
        </CardDescription>
      </Card>
    );
  }

  const message = bookingShareMessage(instructorName, bookingUrl);
  const file = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg(bookingUrl))}`;

  const shareToInstagram = () => {
    if (typeof navigator.share === 'function') {
      void navigator.share({ title: `Book with ${instructorName}`, text: message, url: bookingUrl }).catch(() => undefined);
      return;
    }
    copy(bookingUrl, 'Link copied. Paste it into your Instagram bio or story.');
  };

  return (
    <Card className="flex flex-col gap-4" role="region" aria-labelledby={titleId}>
      <div className="flex flex-col gap-1">
        <CardTitle id={titleId}>Your booking link</CardTitle>
        <CardDescription>Learners book with you from this link. Put it in your bio, your car and your messages.</CardDescription>
      </div>
      <Field label="Link">
        <Input readOnly value={bookingUrl} onFocus={(event) => { event.target.select(); }} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => { copy(bookingUrl, 'Link copied'); }}>
          <Copy className="size-5" aria-hidden />
          Copy link
        </Button>
        <Button variant="secondary" asChild>
          <a href={whatsAppShareUrl(message)} target="_blank" rel="noreferrer">
            <MessageCircle className="size-5" aria-hidden />
            WhatsApp
          </a>
        </Button>
        <Button variant="secondary" onClick={shareToInstagram}>
          <Share2 className="size-5" aria-hidden />
          Instagram
        </Button>
      </div>
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <svg
          viewBox={`0 0 ${String(code.size)} ${String(code.size)}`}
          role="img"
          aria-label="QR code for your booking link"
          className="size-40 shrink-0 rounded-card border border-grey-200"
          shapeRendering="crispEdges"
        >
          <rect width={code.size} height={code.size} className="fill-white" />
          <path d={code.path} className="fill-black" />
        </svg>
        <div className="flex flex-col gap-2">
          <p className="text-small text-grey-700">Scanned with a phone camera, it opens your booking link. Print it on a card or a sticker for your car.</p>
          <Button variant="tertiary" asChild>
            <a href={file} download="booking-link-qr-code.svg">
              <Download className="size-5" aria-hidden />
              Download QR code
            </a>
          </Button>
        </div>
      </div>
      {profileUrl === null ? null : (
        <a href={profileUrl} className="text-small font-semibold text-blue underline underline-offset-4">
          See your public profile
        </a>
      )}
    </Card>
  );
}
