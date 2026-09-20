'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui/tabs';
import type { ReactNode } from 'react';

export interface LearnerTab {
  value: string;
  label: string;
  panel: ReactNode;
}

/**
 * A learner's card, one subject at a time (LRN-02, D-189). The card had grown to nine sections
 * down one page; the product owner asked for tabs, with what matters most open first.
 *
 * Every panel is drawn on the server and handed in, so switching tabs costs nothing and the card
 * still works with no signal once it is open.
 */
export function LearnerTabs({ tabs }: { tabs: LearnerTab[] }) {
  const first = tabs[0]?.value ?? 'summary';
  return (
    <Tabs defaultValue={first} className="flex flex-col gap-4">
      {/* Five of them do not fit across a phone, so the strip scrolls rather than wrapping. */}
      <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <TabsList aria-label="About this learner" className="w-max">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="px-4">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="flex flex-col gap-4 pt-0">
          {tab.panel}
        </TabsContent>
      ))}
    </Tabs>
  );
}

/** Past and still to come, under the Lessons tab, which is how an instructor reads a diary. */
export function LessonHistoryTabs({ upcoming, past }: { upcoming: ReactNode; past: ReactNode }) {
  return (
    <Tabs defaultValue="upcoming" className="flex flex-col gap-4">
      <TabsList aria-label="Which lessons" className="w-full md:w-72">
        <TabsTrigger value="upcoming" className="px-2">
          Upcoming
        </TabsTrigger>
        <TabsTrigger value="past" className="px-2">
          Past
        </TabsTrigger>
      </TabsList>
      <TabsContent value="upcoming" className="pt-0">
        {upcoming}
      </TabsContent>
      <TabsContent value="past" className="pt-0">
        {past}
      </TabsContent>
    </Tabs>
  );
}
