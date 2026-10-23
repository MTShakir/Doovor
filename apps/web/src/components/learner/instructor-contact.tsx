import { whatsAppTo } from '@repo/core/phone';
import { Button } from '@repo/ui/button';
import { Phone } from 'lucide-react';
import { icons } from '@/lib/icons';

/**
 * A learner's way to their own instructor (BOK-08, D-386): a call, a text or a WhatsApp, on the
 * mobile the instructor verified. Only the instructor moves a lesson, so this is how a learner
 * asks them to.
 */
export function InstructorContact({ name, phone }: { name: string; phone: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={`Get in touch with ${name}`}>
      <Button asChild variant="secondary">
        <a href={`tel:${phone}`}>
          <Phone className="size-5" aria-hidden />
          Call
        </a>
      </Button>
      <Button asChild variant="secondary">
        <a href={`sms:${phone}`}>
          <icons.text className="size-5" aria-hidden />
          Text
        </a>
      </Button>
      <Button asChild variant="secondary">
        <a href={whatsAppTo(phone)} target="_blank" rel="noreferrer">
          <icons.whatsApp className="size-5" aria-hidden />
          WhatsApp
        </a>
      </Button>
    </div>
  );
}
