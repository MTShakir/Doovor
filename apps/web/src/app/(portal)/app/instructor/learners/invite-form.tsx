'use client';

import { emailShareUrl, invitationText, smsShareUrl, whatsappShareUrl } from '@repo/core/invitations';
import { Button } from '@repo/ui/button';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { Select } from '@repo/ui/select';
import { toast } from '@repo/ui/toast';
import { Copy, Mail, MessageCircle, Smartphone } from 'lucide-react';
import { useState, useTransition } from 'react';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';
import { inviteLearner, type Invitation } from './actions';

const channels = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'sms', label: 'Text message' },
  { value: 'email', label: 'Email' },
  { value: 'link', label: 'Just give me the link' },
];

type Channel = 'whatsapp' | 'sms' | 'email' | 'link';

/** AUTH-07: the instructor sends a link the learner opens on their phone. */
export function InviteForm() {
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [channel, setChannel] = useState<Channel>('whatsapp');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [invitation, setInvitation] = useState<Invitation | null>(null);

  const onSubmit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    startTransition(async () => {
      const result = await inviteLearner({ channel, fullName, email, phone });
      if (result.ok) {
        setInvitation(result.data);
        return;
      }
      setErrors(result.fields ?? {});
      if (!result.fields) setFormError(result.message);
    });
  };

  if (invitation) {
    const share =
      channel === 'sms' ? smsShareUrl(invitation) : channel === 'email' ? emailShareUrl(invitation) : whatsappShareUrl(invitation);
    const Icon = channel === 'sms' ? Smartphone : channel === 'email' ? Mail : MessageCircle;

    return (
      <div className="flex flex-col gap-4">
        <FormAlert tone="success">
          The link is ready. It works once, and stops working in 14 days.
        </FormAlert>
        <Field label="Their link" hint="Anyone with this link can book with you, so send it to them only.">
          <Input readOnly value={invitation.link} onFocus={(event) => { event.target.select(); }} />
        </Field>
        <div className="flex flex-wrap gap-2">
          {channel === 'link' ? null : (
            <Button asChild>
              <a href={share} target="_blank" rel="noreferrer">
                <Icon className="size-5" aria-hidden />
                Send it
              </a>
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => {
              void navigator.clipboard.writeText(invitation.link).then(
                () => { toast('Link copied'); },
                () => { toast('Copy it from the box above'); },
              );
            }}
          >
            <Copy className="size-5" aria-hidden />
            Copy link
          </Button>
          <Button variant="tertiary" onClick={() => { setInvitation(null); setFullName(''); setEmail(''); setPhone(''); }}>
            Invite someone else
          </Button>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-small font-semibold text-ink">What it says</p>
          {/* A link is one long word: without this it pushes the page sideways on a phone. */}
          <p className="text-small wrap-anywhere text-grey-700">{invitationText(invitation)}</p>
        </div>
      </div>
    );
  }

  return (
    <ClientForm onSubmit={onSubmit} pending={pending} className="flex flex-col gap-4">
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      <Field label="Their name" hint="Optional, and only so the message reads properly." error={errors.fullName}>
        <Input autoComplete="off" value={fullName} onChange={(event) => { setFullName(event.target.value); }} />
      </Field>
      <Field label="How will you send it?">
        <Select
          options={channels}
          value={channel}
          onChange={(event) => { setChannel(event.target.value as Channel); }}
        />
      </Field>
      {channel === 'email' ? (
        <Field label="Their email" error={errors.email}>
          <Input type="email" inputMode="email" value={email} onChange={(event) => { setEmail(event.target.value); }} />
        </Field>
      ) : null}
      {channel === 'sms' || channel === 'whatsapp' ? (
        <Field label="Their mobile number" error={errors.phone}>
          <Input type="tel" inputMode="tel" placeholder="07700 900123" value={phone} onChange={(event) => { setPhone(event.target.value); }} />
        </Field>
      ) : null}
      <SubmitButton width="responsive" pending={pending}>
        Make the link
      </SubmitButton>
    </ClientForm>
  );
}
