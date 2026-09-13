'use client';

import { formatDateTime } from '@repo/core/time';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { Field } from '@repo/ui/field';
import { Textarea } from '@repo/ui/input';
import { toast, toastWithUndo, UNDO_WINDOW_MS } from '@repo/ui/toast';
import { Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, useTransition } from 'react';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';
import type { LearnerNote } from '@/lib/learners/notes';
import { addLearnerNote, deleteLearnerNote } from './actions';

export interface NotesProps {
  learnerId: string;
  notes: LearnerNote[];
  /** Who is reading: only the person who wrote a note may take it back. */
  viewerId: string;
}

/** LRN-04: what the instructor remembers about a learner. The learner never sees any of it. */
export function Notes({ learnerId, notes, viewerId }: NotesProps) {
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Undone deletions come straight back, so the row goes only when the moment has passed.
  const [removed, setRemoved] = useState<string[]>([]);
  const waiting = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  // Leaving the page does not cancel a deletion: what is still counting down goes now.
  useEffect(() => {
    const timers = waiting.current;
    return () => {
      for (const [id, timer] of timers) {
        clearTimeout(timer);
        void deleteLearnerNote({ id, learnerId });
      }
      timers.clear();
    };
  }, [learnerId]);

  const onSubmit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addLearnerNote({ learnerId, body });
      if (!result.ok) {
        setError(result.fields?.body ?? result.message);
        return;
      }
      // The action revalidates this page, so the new note arrives with its answer.
      setBody('');
    });
  };

  const remove = (note: LearnerNote) => {
    setRemoved((current) => [...current, note.id]);

    // The five seconds are counted here rather than by the toast: a toast sits still while
    // the pointer is over it, and a deletion that waits for the mouse to move is a bug.
    const deleting = setTimeout(() => {
      waiting.current.delete(note.id);
      void deleteLearnerNote({ id: note.id, learnerId }).then((result) => {
        if (result.ok) return;
        // It is still there, so put it back rather than leave a gap that is not real.
        setRemoved((current) => current.filter((id) => id !== note.id));
        toast('That note is still there. Try again.');
      });
    }, UNDO_WINDOW_MS);
    waiting.current.set(note.id, deleting);

    toastWithUndo('Note deleted', () => {
      clearTimeout(deleting);
      waiting.current.delete(note.id);
      setRemoved((current) => current.filter((id) => id !== note.id));
    });
  };

  const shown = notes.filter((note) => !removed.includes(note.id));

  return (
    <Card padding="none" role="region" aria-labelledby="notes-title">
      <div className="flex flex-col gap-1 px-4 pt-4">
        <CardTitle id="notes-title">Private notes</CardTitle>
        <CardDescription>Only you and whoever manages your Business can read these.</CardDescription>
      </div>

      <div className="px-4 py-4">
        <ClientForm onSubmit={onSubmit} pending={pending} className="flex flex-col gap-3">
          {error ? <FormAlert>{error}</FormAlert> : null}
          <Field label="Add a note" hideLabel>
            <Textarea
              placeholder="Nervous on roundabouts. Wants to practise the test route next time."
              value={body}
              onChange={(event) => { setBody(event.target.value); }}
            />
          </Field>
          <SubmitButton width="responsive" pending={pending}>
            Save note
          </SubmitButton>
        </ClientForm>
      </div>

      {shown.length === 0 ? (
        <p className="px-4 pb-4 text-small text-grey-700">Nothing written down yet.</p>
      ) : (
        <ul className="flex flex-col border-t border-grey-200">
          {shown.map((note) => (
            <li key={note.id} className="flex items-start gap-3 border-b border-grey-200 px-4 py-3 last:border-b-0">
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-body whitespace-pre-wrap text-ink">{note.body}</span>
                <span className="text-small text-grey-700">
                  {note.authorName} · {formatDateTime(new Date(note.createdAt))}
                </span>
              </span>
              {note.authorId === viewerId ? (
                <button
                  type="button"
                  onClick={() => { remove(note); }}
                  aria-label={`Delete the note from ${formatDateTime(new Date(note.createdAt))}`}
                  className="flex size-12 shrink-0 items-center justify-center rounded-full text-black hover:bg-grey-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-black"
                >
                  <Trash2 className="size-5" aria-hidden />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
