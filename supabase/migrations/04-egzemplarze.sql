-- =====================================================================
-- VinyLog · migracja 04: liczba egzemplarzy tej samej płyty
-- Uruchom w Supabase: SQL Editor → New query → wklej → Run
-- Istniejące płyty dostają 1 egzemplarz. Polityki RLS z migracji 01 obejmują nową kolumnę.
-- =====================================================================

alter table public.albums
  add column if not exists copies smallint not null default 1
  check (copies between 1 and 99);

-- Kontrola (uruchom osobno):
-- select copies, count(*) from public.albums group by copies;
