'use client';

import { brand, type ColourToken } from '@repo/config/brand';
import { formatPence } from '@repo/core/money';
import { Avatar } from '@repo/ui/avatar';
import { AvatarPicker } from '@repo/ui/avatar-picker';
import { PhotoUpload } from '@repo/ui/photo-upload';
import { PickupPointPicker } from '@repo/ui/pickup-point-picker';
import { FormAlert } from '@/components/form-alert';
import { RadiusMap } from '@/components/map/radius-map';
import { CardFieldsSkeleton } from '@/components/payments/card-form';
import { SetupChecklist } from '@/components/setup-checklist';
import { Button } from '@repo/ui/button';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { Checkbox } from '@repo/ui/checkbox';
import { Chip, ChipGroup } from '@repo/ui/chip';
import { Dialog } from '@repo/ui/dialog';
import { EmptyState } from '@repo/ui/empty-state';
import { Field } from '@repo/ui/field';
import { Input, Textarea } from '@repo/ui/input';
import { contrastRatio } from '@repo/ui/lib/contrast';
import { ListDivider, ListRow } from '@repo/ui/list-row';
import { MonthCalendar } from '@repo/ui/month-calendar';
import { OtpInput } from '@repo/ui/otp-input';
import { PostcodeSearch } from '@repo/ui/postcode-search';
import { ProgressBar, ProgressRing } from '@repo/ui/progress';
import type { SkillRating } from '@repo/core/skills';
import { RatingScale } from '@repo/ui/rating-scale';
import { RatingStars } from '@repo/ui/rating-stars';
import { Select } from '@repo/ui/select';
import { Sheet } from '@repo/ui/sheet';
import { SkillBar } from '@repo/ui/skill-bar';
import { Skeleton, SkeletonRow } from '@repo/ui/skeleton';
import { Slider } from '@repo/ui/slider';
import { StatusPill, type PillStatus } from '@repo/ui/status-pill';
import { NumberStepper, StepProgress } from '@repo/ui/stepper';
import { Switch } from '@repo/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui/tabs';
import { TimeSlotGrid } from '@repo/ui/time-slot-grid';
import { toast, toastWithUndo } from '@repo/ui/toast';
import { CalendarX, Car } from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';

const sections = [
  'Colour',
  'Type',
  'Buttons',
  'Inputs',
  'Choices',
  'Chips and pills',
  'People',
  'Cards and lists',
  'Feedback',
  'Progress',
  'Checklist',
  'Coverage',
  'Scheduling',
  'Overlays',
  'Navigation',
] as const;

function Section({ title, children }: { title: (typeof sections)[number]; children: ReactNode }) {
  return (
    <section id={title.toLowerCase().replace(/\s+/g, '-')} className="flex scroll-mt-4 flex-col gap-4 border-t border-grey-200 py-8">
      <h2 className="text-h2 text-black">{title}</h2>
      {children}
    </section>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <p className="text-caption font-semibold text-grey-700">{children}</p>;
}

const pillStatuses: PillStatus[] = ['confirmed', 'pending', 'completed', 'paid', 'cancelled', 'attention', 'unpaid', 'overdue', 'credit', 'gap-fill', 'test-day'];

const slots = ['09:00', '10:30', '12:00', '13:30', '15:00', '16:30', '18:00'].map((label, index) => ({
  id: label,
  label,
  disabled: index === 2,
}));

export function DesignShowcase() {
  const [postcode, setPostcode] = useState('LS6 3HN');
  const [otp, setOtp] = useState('1234');
  const [skillRating, setSkillRating] = useState<SkillRating | null>(3);
  const [checked, setChecked] = useState(true);
  const [notify, setNotify] = useState(true);
  const [radius, setRadius] = useState(8);
  const [duration, setDuration] = useState(90);
  const [slot, setSlot] = useState<string | null>('10:30');
  const [month, setMonth] = useState('2026-09-01');
  const [date, setDate] = useState<string | null>('2026-09-15');
  const [chips, setChips] = useState<Record<string, boolean>>({ Automatic: true });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const [document, setDocument] = useState<string | undefined>(undefined);
  const [pickup, setPickup] = useState<string | undefined>(undefined);

  return (
    <main className="mx-auto max-w-5xl px-4 pb-24 md:px-8">
      <header className="flex flex-col gap-2 py-8">
        <p className="text-small font-semibold text-grey-700">{brand.name}</p>
        <h1 className="text-display text-black">Design system</h1>
        <p className="text-body text-grey-700">Every component and state from PRD 7.4. Development and preview only.</p>
        <nav aria-label="Sections" className="mt-2 flex flex-wrap gap-2">
          {sections.map((s) => (
            <a key={s} href={`#${s.toLowerCase().replace(/\s+/g, '-')}`} className="text-small text-blue underline underline-offset-4">
              {s}
            </a>
          ))}
        </nav>
      </header>

      <Section title="Colour">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {(Object.keys(brand.colours) as ColourToken[]).map((token) => (
            <div key={token} className="flex flex-col gap-2 rounded-card border border-grey-200 p-3">
              <div className="h-16 rounded-input border border-grey-200" style={{ backgroundColor: `var(--brand-${token})` }} />
              <p className="text-small font-semibold text-ink">{token}</p>
              <p className="text-caption text-grey-700 tabular-nums">
                {brand.colours[token]} · {contrastRatio(brand.colours[token], brand.colours.white).toFixed(2)}:1 on white
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Type">
        <div className="flex flex-col gap-3">
          <p className="text-display">Display 36/40 bold</p>
          <p className="text-h1">H1 28/34 bold</p>
          <p className="text-h2">H2 22/28 semibold</p>
          <p className="text-h3">H3 18/24 semibold</p>
          <p className="text-body">Body 16/24 regular. Plain British English, short sentences.</p>
          <p className="text-small">Small 14/20. Tue 15 Sep, 14:30.</p>
          <p className="text-caption">Caption 12/16</p>
          <p className="text-h2 tabular-nums">
            {formatPence(4200)} · {formatPence(4250)} · {formatPence(38000)}
          </p>
        </div>
      </Section>

      <Section title="Buttons">
        <Label>Primary, secondary, tertiary, destructive</Label>
        <div className="flex flex-wrap items-center gap-3">
          <Button>Book lesson</Button>
          <Button variant="secondary">Add learner</Button>
          <Button variant="tertiary">More options</Button>
          <Button variant="destructive">Cancel lesson</Button>
        </div>
        <Label>States: pending, disabled, large, icon</Label>
        <div className="flex flex-wrap items-center gap-3">
          <Button pending>Saving</Button>
          <Button disabled>Book lesson</Button>
          <Button variant="secondary" disabled>
            Add learner
          </Button>
          <Button size="lg">Start lesson</Button>
          <Button variant="secondary" size="icon" aria-label="Add car">
            <Car size={24} strokeWidth={1.5} aria-hidden />
          </Button>
        </div>
        <Label>Responsive width: full on phones, natural from tablet</Label>
        <Button width="responsive" size="lg">
          Get paid
        </Button>
        <Label>As a link</Label>
        <Button asChild variant="secondary">
          <Link href="/">Go home</Link>
        </Button>
      </Section>

      <Section title="Inputs">
        <div className="grid gap-6 md:grid-cols-2">
          <Field label="Full name" hint="As it appears on your licence.">
            <Input placeholder="Sam Taylor" autoComplete="name" />
          </Field>
          <Field label="Email" error="Enter an email address like name@example.com">
            <Input type="email" defaultValue="sam@" />
          </Field>
          <Field label="Postcode">
            <Input disabled defaultValue="M1 2QF" />
          </Field>
          <Field label="Lesson type">
            <Select
              placeholder="Choose a lesson type"
              options={[
                { value: 'standard', label: 'Standard lesson' },
                { value: 'motorway', label: 'Motorway' },
                { value: 'test-day', label: 'Test day' },
              ]}
            />
          </Field>
          <Field label="Bio" hint="Up to 300 characters.">
            <Textarea placeholder="Calm, patient instructor with 10 years of experience." maxLength={300} />
          </Field>
          <Field label="Verification code" hint="We sent a 6-digit code to 07700 900001.">
            <OtpInput value={otp} onChange={setOtp} />
          </Field>
        </div>
        <Label>Postcode search card (PRD 7.5)</Label>
        <div className="rounded-card bg-grey-100 p-4">
          <PostcodeSearch
            aria-label="Where do you want lessons?"
            placeholder="Where do you want lessons?"
            value={postcode}
            onChange={(e) => {
              setPostcode(e.target.value);
            }}
            onUseLocation={() => toast('Location is used only to find nearby instructors')}
          />
        </div>
        <Label>Card details (M3-23). The fields are drawn by the payment provider in its own frame, dressed as the inputs above</Label>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-3">
            <CardFieldsSkeleton />
            <Button width="responsive" size="lg" disabled>
              Pay £42
            </Button>
          </div>
          <div className="flex flex-col gap-3">
            <FormAlert>The card was refused. Try another one.</FormAlert>
            <Button width="responsive" size="lg">
              Pay £42
            </Button>
          </div>
        </div>
      </Section>

      <Section title="Choices">
        <div className="grid gap-2 md:grid-cols-2">
          <Checkbox
            label="I have dual controls"
            description="Required for lessons with learners."
            checked={checked}
            onCheckedChange={(v) => {
              setChecked(v === true);
            }}
          />
          <Checkbox label="Disabled option" disabled />
          <Switch label="Lesson reminders" description="Email and push, 24 hours before." checked={notify} onCheckedChange={setNotify} />
          <Switch label="Instant book" disabled />
        </div>
        <Label>Skill rating, 1 to 5 (M4-05)</Label>
        <div className="grid max-w-md gap-4">
          <RatingScale label="Junctions" value={skillRating} onChange={setSkillRating} />
          <RatingScale label="Roundabouts" value={null} onChange={() => undefined} />
        </div>
        <Label>Tabs</Label>
        <Tabs defaultValue="week" className="max-w-md">
          <TabsList className="w-full">
            <TabsTrigger value="day">Day</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="month">Month</TabsTrigger>
          </TabsList>
          <TabsContent value="day">Day view arrives in M1.</TabsContent>
          <TabsContent value="week">Week view arrives in M1.</TabsContent>
          <TabsContent value="month">Month view arrives in M1.</TabsContent>
        </Tabs>
      </Section>

      <Section title="Chips and pills">
        <Label>Filter chips</Label>
        <ChipGroup>
          {['Manual', 'Automatic', 'Available this week', 'Under £40'].map((label) => (
            <Chip
              key={label}
              selected={chips[label] ?? false}
              onClick={() => {
                setChips((c) => ({ ...c, [label]: !c[label] }));
              }}
            >
              {label}
            </Chip>
          ))}
          <Chip disabled>Disabled</Chip>
        </ChipGroup>
        <Label>Status pills</Label>
        <div className="flex flex-wrap gap-2">
          {pillStatuses.map((status) => (
            <StatusPill key={status} status={status} />
          ))}
          <StatusPill status="paid">Paid (cash)</StatusPill>
          <StatusPill status="paid">Paid (bank)</StatusPill>
        </div>
      </Section>

      <Section title="People">
        <div className="flex flex-wrap items-end gap-4">
          <Avatar name="Sarah Khan" size="sm" />
          <Avatar name="Sarah Khan" size="md" verified />
          <Avatar name="James O'Neill" size="lg" verified />
          <Avatar name="Priya Patel" size="xl" verified />
          <Avatar name="Tom" size="lg" />
          <Avatar name="Jack Taylor" size="md" decorative />
        </div>
        <div className="flex flex-col gap-2">
          <RatingStars rating={4.5} count={32} />
          <RatingStars rating={3} />
        </div>
        <div className="grid gap-8 md:grid-cols-2">
          <AvatarPicker
            name="Priya Patel"
            src={picked}
            label="Your photo"
            hint="Learners are more likely to book an instructor they can see."
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChoose={(file) => { setPicked(URL.createObjectURL(file)); }}
            onRemove={() => { setPicked(undefined); }}
          />
          <AvatarPicker
            name="Priya Patel"
            label="Uploading"
            accept="image/jpeg"
            busy
            onChoose={() => undefined}
          />
          <AvatarPicker
            name="Priya Patel"
            label="Something went wrong"
            accept="image/jpeg"
            error="That picture is too large. Choose one under 15MB."
            onChoose={() => undefined}
          />
        </div>
        <div className="grid gap-8 md:grid-cols-2">
          <PhotoUpload
            label="Photo of your badge"
            hint="We check the number against the DVSA register."
            accept="image/jpeg,image/png,image/webp,image/gif"
            src={document}
            onChoose={(file) => { setDocument(URL.createObjectURL(file)); }}
            onRemove={() => { setDocument(undefined); }}
          />
          <PhotoUpload
            label="Already uploaded"
            accept="image/jpeg"
            stored
            storedLabel="Badge photo added"
            onChoose={() => undefined}
          />
          <PhotoUpload label="Uploading" accept="image/jpeg" busy onChoose={() => undefined} />
          <PhotoUpload
            label="Something went wrong"
            accept="image/jpeg"
            error="We could not read that picture. Try another one."
            onChoose={() => undefined}
          />
        </div>
      </Section>

      <Section title="Cards and lists">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardTitle>Outline card</CardTitle>
            <CardDescription>Default surface for grouped content.</CardDescription>
          </Card>
          <Card variant="filled">
            <CardTitle>Filled card</CardTitle>
            <CardDescription>Grey-100 background.</CardDescription>
          </Card>
          <Card variant="raised">
            <CardTitle>Raised card</CardTitle>
            <CardDescription>For floating panels.</CardDescription>
          </Card>
        </div>
        <Card padding="none" className="overflow-hidden">
          <ListRow
            leading={<Avatar name="Sam Taylor" />}
            title="Sam Taylor"
            subtitle="Tue 15 Sep, 14:30 · Pickup: home"
            trailing={<StatusPill status="confirmed" />}
          />
          <ListDivider />
          <ListRow
            asChild
            chevron
            leading={<Avatar name="Aisha Begum" />}
            title="Aisha Begum"
            subtitle="Automatic · 12 hours driven"
            trailing={formatPence(4250)}
          >
            <Link href="/design" aria-label="Aisha Begum, automatic, 12 hours driven" />
          </ListRow>
          <ListDivider />
          <ListRow title="Payments" subtitle="Card, cash or bank transfer" chevron />
        </Card>
      </Section>

      <Section title="Feedback">
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => toast('Lesson booked for Tue 15 Sep, 14:30')}>
            Show toast
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              toastWithUndo('Lesson cancelled', () => {
                toast('Cancellation undone');
              })
            }
          >
            Toast with undo
          </Button>
        </div>
        <Label>Skeletons</Label>
        <Card padding="none">
          <SkeletonRow />
          <SkeletonRow />
          <div className="flex gap-3 p-4">
            <Skeleton className="h-24 flex-1" />
            <Skeleton className="h-24 flex-1" />
          </div>
        </Card>
        <Label>Empty state</Label>
        <Card>
          <EmptyState
            icon={CalendarX}
            title="No lessons today"
            description="Enjoy the day off, or add a lesson for one of your learners."
            action={<Button width="full">Book lesson</Button>}
          />
        </Card>
      </Section>

      <Section title="Progress">
        <StepProgress current={2} total={5} className="max-w-md" />
        <ProgressBar value={60} label="Onboarding progress" className="max-w-md" />
        <div className="flex items-center gap-4">
          <ProgressRing value={33} label="Setup checklist" />
          <ProgressRing value={100} label="Profile complete" size={72} />
        </div>
        <div className="grid max-w-xl gap-4">
          {(['Moving off', 'Junctions', 'Roundabouts', 'Manoeuvres', 'Independent driving', 'Dual carriageways'] as const).map(
            (skill, index) => (
              <SkillBar key={skill} skill={skill} rating={index} />
            ),
          )}
        </div>
        <NumberStepper
          label="Lesson length"
          value={duration}
          onChange={setDuration}
          min={60}
          max={240}
          step={30}
          format={(v) => `${String(v)} min`}
        />
      </Section>

      <Section title="Checklist">
        <div className="grid gap-4 md:grid-cols-2">
          <SetupChecklist state={{ learners: 0, paymentsConnected: false, verified: false, listed: true }} />
          <SetupChecklist state={{ learners: 3, paymentsConnected: false, verified: true, listed: true }} />
        </div>
      </Section>

      <Section title="Coverage">
        <div className="grid gap-4 md:grid-cols-2">
          <RadiusMap centre={null} radiusMiles={radius} place="LS6 3HN" />
          <RadiusMap centre={null} radiusMiles={1} />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <PickupPointPicker
            label="Where does this lesson start?"
            options={[
              { id: 'home', kind: 'home', label: 'Home', address: '12 Hyde Park Road, Leeds LS6 1AB', isDefault: true },
              { id: 'college', kind: 'school', label: 'College', address: 'Leeds City College, LS2 7EA' },
              { id: 'work', kind: 'work', label: 'Work', address: '1 Wellington Place, Leeds LS1 4AP' },
            ]}
            value={pickup}
            onChange={setPickup}
            onAdd={() => toast('The add form arrives with learner management')}
          />
          <PickupPointPicker label="Nothing added yet" options={[]} onChange={() => undefined} />
        </div>
      </Section>

      <Section title="Scheduling">
        <Label>Time slot grid (selected, available, taken)</Label>
        <TimeSlotGrid label="Times on Tue 15 Sep" slots={slots} value={slot} onChange={setSlot} className="max-w-md" />
        <Label>Coverage radius slider (COV-01)</Label>
        <div className="flex max-w-md flex-col gap-1">
          <Slider
            label="Coverage radius"
            value={radius}
            onValueChange={setRadius}
            min={1}
            max={30}
            valueText={(v) => `${String(v)} miles`}
          />
          <p className="text-small text-grey-700 tabular-nums">{radius} miles</p>
        </div>
        <Label>Month calendar (day and week diary views arrive in M1, map in M1)</Label>
        <Card className="max-w-sm">
          <MonthCalendar
            month={month}
            onMonthChange={setMonth}
            selected={date}
            onSelect={setDate}
            today="2026-09-11"
            isDisabled={(d) => d < '2026-09-11'}
            marked={new Set(['2026-09-15', '2026-09-17', '2026-09-22'])}
          />
        </Card>
      </Section>

      <Section title="Overlays">
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              setSheetOpen(true);
            }}
          >
            Open sheet
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setDialogOpen(true);
            }}
          >
            Open dialog
          </Button>
        </div>
        <Sheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          title="Lesson with Sam Taylor"
          description="Tue 15 Sep, 14:30 to 16:00"
          footer={
            <Button
              width="full"
              onClick={() => {
                setSheetOpen(false);
              }}
            >
              Start lesson
            </Button>
          }
        >
          <div className="flex flex-col">
            <ListRow className="px-0" title="Pickup" subtitle="12 Cardigan Road, LS6" />
            <ListRow className="px-0" title="Payment" trailing={<StatusPill status="paid">Paid (cash)</StatusPill>} />
            <ListRow className="px-0" title="Lesson type" subtitle="Standard, 90 minutes" />
          </div>
        </Sheet>
        <Dialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title="Suspend this business?"
          description="Learners will not be able to book until you reactivate it."
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setDialogOpen(false);
                }}
              >
                Keep active
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setDialogOpen(false);
                }}
              >
                Suspend
              </Button>
            </>
          }
        />
      </Section>

      <Section title="Navigation">
        <p className="text-body text-grey-700">Portal shells with bottom tabs on phones and a sidebar on desktop (PRD 8.2).</p>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="secondary">
            <Link href="/app/learner">Learner</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/app/instructor">Instructor</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/app/school">School</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/admin">Admin</Link>
          </Button>
        </div>
      </Section>
    </main>
  );
}
