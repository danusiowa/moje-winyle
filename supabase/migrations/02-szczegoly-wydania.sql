-- =====================================================================
-- VinyLog · migracja 02: szczegóły wydania
-- Uruchom w Supabase: SQL Editor → New query → wklej → Run
-- Dane są ujednolicone w aplikacji, niezależnie od źródła (Discogs / MusicBrainz).
-- Polityki RLS z migracji 01 obejmują nowe kolumny automatycznie.
-- =====================================================================

begin;

alter table public.albums
  add column if not exists year           smallint check (year between 1900 and 2100), -- rok wydania
  add column if not exists country        text,  -- kod kraju ISO, np. GB, PL; XE = Europa, XW = świat
  add column if not exists label          text,  -- wytwórnia
  add column if not exists catalog_number text,  -- numer katalogowy, np. K 56344
  add column if not exists format         text,  -- np. 2×LP 12", reedycja, 180 g
  add column if not exists master_url     text;  -- link do wszystkich wydań albumu (master / release group)

commit;

-- Kontrola (uruchom osobno):
-- select column_name, data_type from information_schema.columns
-- where table_schema = 'public' and table_name = 'albums' order by ordinal_position;
