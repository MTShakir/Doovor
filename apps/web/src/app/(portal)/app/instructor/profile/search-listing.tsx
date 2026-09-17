'use client';

import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { Switch } from '@repo/ui/switch';
import { toast } from '@repo/ui/toast';
import { useState, useTransition } from 'react';
import { saveListing } from './actions';

export interface SearchListingProps {
  listed: boolean;
  /** The badge has run out, so search leaves the profile out whatever the switch says (INS-03). */
  badgeExpired: boolean;
}

/**
 * PUB-04: whether learners can find the profile on city pages and in search engines. The booking
 * link works either way, so an instructor who fills their diary from their own learners can stay
 * out of sight (M5-06).
 */
export function SearchListing({ listed, badgeExpired }: SearchListingProps) {
  const [shown, setShown] = useState(listed);
  const [pending, startTransition] = useTransition();

  const change = (next: boolean) => {
    setShown(next);
    startTransition(async () => {
      const result = await saveListing(next);
      if (!result.ok) {
        setShown(!next);
        toast(result.message);
        return;
      }
      toast(next ? 'Your profile is in search' : 'Your profile is hidden from search');
    });
  };

  return (
    <Card className="flex flex-col gap-3">
      <CardTitle>Search</CardTitle>
      <Switch
        label="Show me in search"
        description="Learners find you on city pages and in search engines. Your booking link works either way."
        checked={shown}
        disabled={pending}
        onCheckedChange={change}
      />
      {badgeExpired ? (
        <CardDescription>Your profile is out of search until your badge is renewed.</CardDescription>
      ) : null}
    </Card>
  );
}
