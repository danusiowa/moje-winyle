-- =====================================================================
-- VinyLog · migracja 03: własny magazyn okładek (Supabase Storage)
-- Uruchom w Supabase: SQL Editor → New query → wklej → Run
--
-- Okładki są kopiowane do koszyka „covers”, każda w folderze właściciela:
--   covers/<user_id>/<losowy-uuid>.jpg
-- Limit 10 MB na plik; aplikacja i tak zmniejsza okładki do 800 px (zwykle 60–150 KB).
-- Skrypt można uruchomić ponownie bez szkody (aktualizuje ustawienia koszyka).
-- Obrazek da się otworzyć z linku (to okładka płyty, nic prywatnego; linki
-- są losowe), ale dodawać i usuwać pliki może tylko właściciel folderu.
-- =====================================================================

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('covers', 'covers', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "covers_select_own" on storage.objects;
drop policy if exists "covers_insert_own" on storage.objects;
drop policy if exists "covers_delete_own" on storage.objects;

create policy "covers_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "covers_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "covers_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid())::text);

commit;

-- Kontrola (uruchom osobno):
-- select id, public, file_size_limit from storage.buckets where id = 'covers';
-- select bucket_id, count(*) from storage.objects group by bucket_id;
