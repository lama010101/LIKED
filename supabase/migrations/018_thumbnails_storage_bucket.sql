-- Migration 018 — Thumbnails storage bucket (P8-T01, PRD §15.1)
--
-- The extract-node-metadata Edge Function uploads discovered Open-Graph
-- images to Storage bucket `thumbnails` and returns the resulting key to
-- the caller. The bucket is public-read (thumbnails are non-sensitive)
-- and owner-write via RLS on storage.objects.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'thumbnails',
  'thumbnails',
  true,
  8 * 1024 * 1024, -- 8MB cap (matches Edge Function)
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
)
ON CONFLICT (id) DO NOTHING;

-- Public read (bucket is public, but we still state it for clarity)
DROP POLICY IF EXISTS "thumbnails_public_read" ON storage.objects;
CREATE POLICY "thumbnails_public_read"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'thumbnails');

-- Authenticated users may upload into their own user-id-prefixed folder.
-- The Edge Function uploads with path `{user_id}/{uuid}.{ext}` so enforcing
-- the prefix both for the user's own manual uploads and for the service
-- role (which bypasses RLS) is harmless.
DROP POLICY IF EXISTS "thumbnails_insert_own" ON storage.objects;
CREATE POLICY "thumbnails_insert_own"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'thumbnails'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "thumbnails_delete_own" ON storage.objects;
CREATE POLICY "thumbnails_delete_own"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'thumbnails'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
