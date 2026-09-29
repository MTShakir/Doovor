import {
  avatarImage,
  badgeImage,
  businessObjectPath,
  feedbackImage,
  feedbackObjectPath,
  galleryImage,
  galleryObjectPath,
  preparedImageExtension,
  profileObjectPath,
  receiptImage,
  receiptObjectPath,
} from '@repo/core/images';
import type { Database } from '@repo/db/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clientEnv } from '@/env/client';

/** Profile pictures: public, because they appear on public profiles and city pages. */
export const avatarsBucket = 'avatars';
/** Badge photos: private, readable only by the instructor and the staff reviewing them. */
export const badgesBucket = 'badges';

/** Photographed receipts: private, readable only by the Business whose books they are (MNY-02). */
export const receiptsBucket = 'receipts';

/** Pictures attached to a report: private, readable by the sender and by staff (D-202). */
export const feedbackBucket = 'feedback';

/** Pass photos: public, because the wall they are on is a public profile (D-218). */
export const galleryBucket = 'gallery';

export type ImageBucket =
  | typeof avatarsBucket
  | typeof badgesBucket
  | typeof receiptsBucket
  | typeof feedbackBucket
  | typeof galleryBucket;

/**
 * Public address of a stored photo (M1-03). The database keeps the path only, so the address
 * follows whichever project is serving and a restored or moved project keeps working.
 */
export function avatarUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  return `${clientEnv.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${avatarsBucket}/${path}`;
}

/**
 * Whether an address is a stored profile picture of ours, or a picture carried in the address
 * itself. The share image drawer fetches a photo from the server, so it fetches only these: an
 * instructor may write their own `photo_path`, and nothing they write should send the server
 * anywhere else (NFR-SEC-03, M6-01, D-135).
 */
export function isDrawablePhotoUrl(url: string): boolean {
  return url.startsWith('data:image/') || url.startsWith(`${clientEnv.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${avatarsBucket}/`);
}

const contentType = {
  [avatarsBucket]: avatarImage.outputType,
  [badgesBucket]: badgeImage.outputType,
  [receiptsBucket]: receiptImage.outputType,
  [feedbackBucket]: feedbackImage.outputType,
  [galleryBucket]: galleryImage.outputType,
};


/** What came back from an upload: where it went, or why it did not go (D-223). */
export type UploadOutcome = { ok: true; path: string } | { ok: false; problem: string };

/**
 * Why an upload failed, in words somebody can act on (D-223).
 *
 * It used to say "We could not upload that picture. Try again." whatever had happened, which is a
 * dead end: a phone that cannot reach the server at all, a bucket that is not there yet and a
 * policy that refused the folder all looked the same, to the person and to us. What the server
 * said is included, because that is the sentence that makes a report worth having. None of it is
 * secret: it is one of "Bucket not found", a policy refusal, or the browser saying it could not
 * reach anything.
 */
function uploadProblem(error: { message?: string } | null): string {
  const said = (error?.message ?? '').trim();
  if (said === '') return 'We could not upload that picture. Try again.';
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(said)) {
    return 'We could not reach the server to upload that picture. Check your connection and try again.';
  }
  return `We could not upload that picture: ${said}`;
}

/**
 * Uploads a prepared picture as the signed-in instructor. Storage checks the folder against
 * their own profiles, so a path outside it is refused whatever the app sends.
 */
export async function uploadProfileImage(
  supabase: SupabaseClient<Database>,
  bucket: ImageBucket,
  profileId: string,
  blob: Blob,
): Promise<UploadOutcome> {
  // What the browser actually produced, in the name and in what we tell the bucket (D-224).
  const path = profileObjectPath(profileId, crypto.randomUUID(), preparedImageExtension(blob.type));
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    contentType: blob.type || contentType[bucket],
    cacheControl: '31536000',
  });
  return error ? { ok: false, problem: uploadProblem(error) } : { ok: true, path };
}

/**
 * Uploads a school's prepared logo as its owner or manager (AUTH-05). Storage checks the folder
 * against who may change the school's profile, whatever the app sends.
 */
export async function uploadBusinessLogo(supabase: SupabaseClient<Database>, businessId: string, blob: Blob): Promise<UploadOutcome> {
  const path = businessObjectPath(businessId, crypto.randomUUID(), preparedImageExtension(blob.type));
  const { error } = await supabase.storage.from(avatarsBucket).upload(path, blob, {
    contentType: blob.type || avatarImage.outputType,
    cacheControl: '31536000',
  });
  return error ? { ok: false, problem: uploadProblem(error) } : { ok: true, path };
}

/** Removes the picture a new one replaced. A failure here is not worth telling anyone about. */
export async function removeProfileImage(
  supabase: SupabaseClient<Database>,
  bucket: ImageBucket,
  path: string | null,
): Promise<void> {
  if (path) await supabase.storage.from(bucket).remove([path]);
}

/**
 * Uploads a photographed receipt into its Business's folder (MNY-02). Storage checks that folder
 * against who keeps those books, whatever the app sends.
 */
export async function uploadReceipt(supabase: SupabaseClient<Database>, businessId: string, blob: Blob): Promise<UploadOutcome> {
  const path = receiptObjectPath(businessId, crypto.randomUUID(), preparedImageExtension(blob.type));
  const { error } = await supabase.storage.from(receiptsBucket).upload(path, blob, {
    contentType: blob.type || receiptImage.outputType,
    cacheControl: '31536000',
  });
  return error ? { ok: false, problem: uploadProblem(error) } : { ok: true, path };
}

/**
 * Public address of a pass photo (D-218). The bucket is public, like avatars, because the wall is
 * on a page anybody can open.
 */
export function galleryUrl(path: string): string {
  return `${clientEnv.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${galleryBucket}/${path}`;
}

/** Uploads a pass photo into its Business's folder (D-218), which is what storage checks. */
export async function uploadGalleryPhoto(
  supabase: SupabaseClient<Database>,
  businessId: string,
  blob: Blob,
): Promise<UploadOutcome> {
  const path = galleryObjectPath(businessId, crypto.randomUUID(), preparedImageExtension(blob.type));
  const { error } = await supabase.storage.from(galleryBucket).upload(path, blob, {
    contentType: blob.type || galleryImage.outputType,
    cacheControl: '31536000',
  });
  return error ? { ok: false, problem: uploadProblem(error) } : { ok: true, path };
}

/** Uploads a picture attached to a report, into the sender's own folder (D-202). */
export async function uploadFeedbackImage(
  supabase: SupabaseClient<Database>,
  userId: string,
  blob: Blob,
): Promise<UploadOutcome> {
  const path = feedbackObjectPath(userId, crypto.randomUUID(), preparedImageExtension(blob.type));
  const { error } = await supabase.storage.from(feedbackBucket).upload(path, blob, {
    contentType: blob.type || feedbackImage.outputType,
    cacheControl: '31536000',
  });
  return error ? { ok: false, problem: uploadProblem(error) } : { ok: true, path };
}

/** A receipt is private, so it is shown through a short-lived address, as a badge is. */
export async function signedReceiptUrl(
  supabase: SupabaseClient<Database>,
  path: string | null,
  seconds = 300,
): Promise<string | undefined> {
  if (!path) return undefined;
  const { data } = await supabase.storage.from(receiptsBucket).createSignedUrl(path, seconds);
  return data?.signedUrl;
}

/** A badge photo is private, so it is shown through a short-lived address (INS-02). */
export async function signedBadgeUrl(
  supabase: SupabaseClient<Database>,
  path: string | null,
  seconds = 300,
): Promise<string | undefined> {
  if (!path) return undefined;
  const { data } = await supabase.storage.from(badgesBucket).createSignedUrl(path, seconds);
  return data?.signedUrl;
}
