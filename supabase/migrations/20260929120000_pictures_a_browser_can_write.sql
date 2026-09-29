-- Buckets take what a browser can actually write (D-224).
--
-- Every bucket accepted `image/webp` and nothing else, because WebP is what the app asks a canvas
-- for and it is the smallest. Safari could not encode WebP from a canvas until 16.4, and a canvas
-- asked for a type it cannot write quietly writes something else, so an iPhone a year or two old
-- produced a different picture from the one we then told the bucket it was. The upload was
-- refused, and the screen said "We could not upload that picture. Try again." with no reason
-- (D-223), which is how the product owner came to report it from a phone.
--
-- The app now asks the canvas what it can write and sends PNG where WebP is not on offer, names
-- the object by what it is, and declares that same type. This is the other half: the buckets
-- accept both.
--
-- PNG rather than JPEG on purpose. The rule the avatars bucket was built on is that an untouched
-- original cannot be stored even by a caller that skips the app, and that rule works because no
-- camera writes the type the bucket takes. A camera writes HEIC or JPEG; a canvas writes WebP or
-- PNG. Allowing JPEG would have let an original through with the position of the home it was
-- taken in still on it.
--
-- PNG is larger than WebP, so the two buckets that were capped at 2 MB take 5 MB, which is what a
-- PNG of a picture that size comes to. The app checks the same ceiling before it uploads.

update storage.buckets
   set allowed_mime_types = array['image/webp', 'image/png']
 where id in ('avatars', 'badges', 'receipts', 'feedback', 'gallery');

update storage.buckets
   set file_size_limit = 5242880
 where id in ('avatars', 'gallery');
