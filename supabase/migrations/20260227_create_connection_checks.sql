-- Supabase bootstrap table for connectivity checks from local scripts.
-- Run this in Supabase SQL Editor before `npm run supabase:test-record`.

create extension if not exists "pgcrypto";

create table if not exists public.connection_checks (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  status text not null default 'ok',
  created_by text,
  note text,
  created_at timestamptz not null default now()
);

alter table public.connection_checks enable row level security;

grant usage on schema public to anon, authenticated;
grant insert, select on table public.connection_checks to anon, authenticated;

drop policy if exists "connection_checks_public_insert" on public.connection_checks;
create policy "connection_checks_public_insert"
on public.connection_checks
for insert
to anon, authenticated
with check (true);

drop policy if exists "connection_checks_public_select" on public.connection_checks;
create policy "connection_checks_public_select"
on public.connection_checks
for select
to anon, authenticated
using (true);
