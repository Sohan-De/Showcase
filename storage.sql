-- =====================================================================
-- Prophone Béziers — image storage bucket.
-- Run once in Supabase > SQL Editor (after schema.sql).
--
-- Creates a PUBLIC bucket "site-images" (anyone can view the images),
-- limited to 2 MB per file and to JPEG / PNG / WebP.
-- Only the admin (public.is_admin()) can upload, replace or delete files.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-images', 'site-images', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "site-images public read"  on storage.objects;
drop policy if exists "site-images admin insert" on storage.objects;
drop policy if exists "site-images admin update" on storage.objects;
drop policy if exists "site-images admin delete" on storage.objects;

create policy "site-images public read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'site-images');

create policy "site-images admin insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'site-images' and public.is_admin());

create policy "site-images admin update" on storage.objects
  for update to authenticated
  using (bucket_id = 'site-images' and public.is_admin())
  with check (bucket_id = 'site-images' and public.is_admin());

create policy "site-images admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'site-images' and public.is_admin());
