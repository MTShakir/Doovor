'use client';

import { formatDate, formatTime } from '@repo/core/time';
import { Button } from '@repo/ui/button';
import { CloudUpload } from 'lucide-react';
import { FormAlert } from '@/components/form-alert';
import type { OutboxRecord } from '@/lib/offline/outbox';

interface KeptRecordsNoticeProps {
  records: readonly Pick<OutboxRecord, 'id' | 'learnerName' | 'lessonStartsAt' | 'state' | 'message'>[];
  onDismiss: (id: string) => void;
}

/**
 * The lesson records saved on this phone that are not on the server yet (PRG-09, M4-11), whatever
 * day their lessons were: how many are waiting for signal, and each one the server turned down, with
 * why, until somebody has read it.
 */
export function KeptRecordsNotice({ records, onDismiss }: KeptRecordsNoticeProps) {
  const waiting = records.filter((one) => one.state === 'waiting').length;
  const turnedDown = records.filter((one) => one.state !== 'waiting');
  if (waiting === 0 && turnedDown.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {waiting === 0 ? null : (
        <p role="status" className="flex items-center gap-2 rounded-input bg-grey-100 px-3 py-2 text-small font-medium text-black">
          <CloudUpload className="size-4 shrink-0" aria-hidden />
          {waiting === 1 ? '1 record saved on this phone, waiting to send.' : `${String(waiting)} records saved on this phone, waiting to send.`}
        </p>
      )}
      {turnedDown.map((record) => {
        const at = new Date(record.lessonStartsAt);
        return (
          <FormAlert key={record.id}>
            <span className="flex flex-col items-start gap-2">
              <span>
                Record for {record.learnerName}, {formatDate(at)} at {formatTime(at)}, not saved.{' '}
                {record.state === 'conflict'
                  ? 'The lesson already has a record, saved from another phone.'
                  : (record.message ?? 'The record was not saved.')}
              </span>
              <Button variant="secondary" onClick={() => { onDismiss(record.id); }}>
                Dismiss
              </Button>
            </span>
          </FormAlert>
        );
      })}
    </div>
  );
}
