'use client';

import { emailShareUrl, invitationText, smsShareUrl, whatsappShareUrl, type InvitationMessage } from '@repo/core/invitations';
import type { InviteChannel } from '@repo/core/schemas/school';
import { Button } from '@repo/ui/button';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { Select } from '@repo/ui/select';
import { toast } from '@repo/ui/toast';
import { Copy, Mail, MessageCircle, Smartphone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';
import { inviteInstructor, type InstructorInvitation } from '../actions';

const channels: { value: InviteChannel; label: string }[] = [
  { value: 'sms', label: 'Text message' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email' },
  { value: 'link', label: 'Just give me the link' },
];

function isChannel(value: string): value is InviteChannel {
  return channels.some((channel) => channel.value === value);
}

/** AUTH-05: the owner makes a link for one instructor and sends it from their own phone (D-118). */
export function InviteInstructorsForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [channel, setChannel] = useState<InviteChannel>('sms');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [invitation, setInvitation] = useState<InstructorInvitation | null>(null);

  const onSubmit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    startTransition(async () => {
      // Only the address the chosen way needs: a number typed before switching to email is not sent.
      const result = await inviteInstructor({
        channel,
        fullName,
        email: channel === 'email' ? email : '',
        phone: channel === 'sms' || channel === 'whatsapp' ? phone : '',
      });
      if (result.ok) {
        setInvitation(result.data);
        // The list of who has been invited is read by the page.
        router.refresh();
        return;
      }
      setErrors(result.fields ?? {});
      if (!result.fields) setFormError(result.message);
    });
  };

  if (invitation) {
    const message: InvitationMessage = {
      kind: 'member',
      link: invitation.link,
      instructorName: invitation.schoolName,
      learnerName: invitation.fullName,
      email: invitation.email,
      phone: invitation.phone,
    };
    const share = channel === 'sms' ? smsShareUrl(message) : channel === 'email' ? emailShareUrl(message) : whatsappShareUrl(message);
    const Icon = channel === 'sms' ? Smartphone : channel === 'email' ? Mail : MessageCircle;
    const who = invitation.fullName ?? 'your instructor';

    return (
      <div className="flex flex-col gap-4">
        <FormAlert tone="success">The link for {who} is ready. It works once, and stops working in 14 days.</FormAlert>
        <Field label="Their link" hint="Whoever opens this link can join your school, so send it to them only.">
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
          <Button
            variant="tertiary"
            onClick={() => {
              setInvitation(null);
              setFullName('');
              setEmail('');
              setPhone('');
            }}
          >
            Invite another instructor
          </Button>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-small font-semibold text-ink">What it says</p>
          {/* A link is one long word: without this it pushes the page sideways on a phone. */}
          <p className="text-small wrap-anywhere text-grey-700">{invitationText(message)}</p>
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
          onChange={(event) => {
            if (isChannel(event.target.value)) setChannel(event.target.value);
          }}
        />
      </Field>
      {channel === 'email' ? (
        <Field label="Their email" error={errors.email}>
          <Input type="email" inputMode="email" autoComplete="off" value={email} onChange={(event) => { setEmail(event.target.value); }} />
        </Field>
      ) : null}
      {channel === 'sms' || channel === 'whatsapp' ? (
        <Field label="Their mobile number" error={errors.phone}>
          <Input
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="07700 900123"
            value={phone}
            onChange={(event) => { setPhone(event.target.value); }}
          />
        </Field>
      ) : null}
      <SubmitButton width="responsive" pending={pending}>
        Make the link
      </SubmitButton>
    </ClientForm>
  );
}
