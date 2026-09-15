'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui/tabs';
import type { ReactNode } from 'react';

/**
 * Lesson records beside the skill map (PRG-03). A wide screen has room for both; a phone shows one
 * at a time under two tabs, the records first, because the newest record is what somebody opens
 * this for after a lesson (PRD 10.3).
 */
export function ProgressLayout({ records, skills }: { records: ReactNode; skills: ReactNode }) {
  // On a wide screen both panels show and the tabs go, so a panel hidden by the tabs is shown again.
  const panel = 'pt-0 data-[state=inactive]:hidden lg:data-[state=inactive]:flex';

  return (
    <Tabs defaultValue="records" className="flex flex-col gap-4">
      <TabsList className="w-full lg:hidden">
        <TabsTrigger value="records">Lesson records</TabsTrigger>
        <TabsTrigger value="skills">Skill map</TabsTrigger>
      </TabsList>
      <div className="flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-8">
        <TabsContent value="records" forceMount className={`flex flex-col gap-3 ${panel}`}>
          <h2 className="sr-only text-h3 text-black lg:not-sr-only">Lesson records</h2>
          {records}
        </TabsContent>
        <TabsContent value="skills" forceMount className={`flex flex-col gap-3 ${panel}`}>
          <h2 className="sr-only text-h3 text-black lg:not-sr-only">Skill map</h2>
          {skills}
        </TabsContent>
      </div>
    </Tabs>
  );
}
