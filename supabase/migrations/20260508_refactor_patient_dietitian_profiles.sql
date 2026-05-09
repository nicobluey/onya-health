begin;

alter table public.patients
  add column if not exists full_name text,
  add column if not exists phone text,
  add column if not exists profile_photo_path text,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

update public.patients p
set
  full_name = coalesce(
    nullif(trim(p.full_name), ''),
    nullif(trim(concat_ws(' ', pr.first_name, pr.last_name)), '')
  ),
  phone = coalesce(
    nullif(trim(p.phone), ''),
    nullif(trim(pr.phone), '')
  ),
  owner_id = coalesce(p.owner_id, p.id),
  updated_at = timezone('utc', now())
from public.profiles pr
where pr.id = p.id;

create table if not exists public.dietitians (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  full_name text not null,
  phone text,
  credentials text,
  bio text,
  profile_photo_path text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.patient_dietitians (
  patient_id uuid not null references public.patients(id) on delete cascade,
  dietitian_id uuid not null references public.dietitians(id) on delete cascade,
  is_primary boolean not null default false,
  assigned_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (patient_id, dietitian_id)
);

create index if not exists idx_dietitians_active_created
  on public.dietitians (is_active, created_at desc);

create index if not exists idx_patient_dietitians_patient_id
  on public.patient_dietitians (patient_id);

create index if not exists idx_patient_dietitians_dietitian_id
  on public.patient_dietitians (dietitian_id);

create unique index if not exists idx_patient_dietitians_one_primary
  on public.patient_dietitians (patient_id)
  where is_primary = true;

create or replace function public.touch_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_patients_touch_updated_at on public.patients;
create trigger trg_patients_touch_updated_at
before update on public.patients
for each row
execute function public.touch_updated_at_timestamp();

drop trigger if exists trg_dietitians_touch_updated_at on public.dietitians;
create trigger trg_dietitians_touch_updated_at
before update on public.dietitians
for each row
execute function public.touch_updated_at_timestamp();

drop trigger if exists trg_patient_dietitians_touch_updated_at on public.patient_dietitians;
create trigger trg_patient_dietitians_touch_updated_at
before update on public.patient_dietitians
for each row
execute function public.touch_updated_at_timestamp();

create or replace function public.patient_dietitians_single_primary()
returns trigger
language plpgsql
as $$
begin
  if new.is_primary then
    update public.patient_dietitians
    set is_primary = false,
        updated_at = timezone('utc', now())
    where patient_id = new.patient_id
      and dietitian_id <> new.dietitian_id
      and is_primary = true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_patient_dietitians_single_primary on public.patient_dietitians;
create trigger trg_patient_dietitians_single_primary
before insert or update on public.patient_dietitians
for each row
execute function public.patient_dietitians_single_primary();

alter table public.dietitians enable row level security;
alter table public.patient_dietitians enable row level security;

drop policy if exists dietitians_select_authenticated on public.dietitians;
create policy dietitians_select_authenticated
on public.dietitians
for select
to authenticated
using (is_active = true);

drop policy if exists patient_dietitians_select_own on public.patient_dietitians;
create policy patient_dietitians_select_own
on public.patient_dietitians
for select
to authenticated
using (patient_id = auth.uid());

drop policy if exists patient_dietitians_insert_own on public.patient_dietitians;
create policy patient_dietitians_insert_own
on public.patient_dietitians
for insert
to authenticated
with check (patient_id = auth.uid());

drop policy if exists patient_dietitians_update_own on public.patient_dietitians;
create policy patient_dietitians_update_own
on public.patient_dietitians
for update
to authenticated
using (patient_id = auth.uid())
with check (patient_id = auth.uid());

insert into public.dietitians (
  id,
  full_name,
  credentials,
  bio,
  profile_photo_path,
  is_active
)
values (
  '9f1f2a68-3b9c-4f2f-8da9-3e7e1c7f1c11',
  'Felicity',
  'Accredited Dietitian',
  'Practical, kind, realistic support.',
  'dietitians/felicity-profile.webp',
  true
)
on conflict (id) do update
set
  full_name = excluded.full_name,
  credentials = excluded.credentials,
  bio = excluded.bio,
  profile_photo_path = excluded.profile_photo_path,
  is_active = true,
  updated_at = timezone('utc', now());

insert into public.patient_dietitians (
  patient_id,
  dietitian_id,
  is_primary,
  assigned_at
)
select
  p.id,
  '9f1f2a68-3b9c-4f2f-8da9-3e7e1c7f1c11'::uuid,
  true,
  timezone('utc', now())
from public.patients p
where not exists (
  select 1
  from public.patient_dietitians pd
  where pd.patient_id = p.id
    and pd.is_primary = true
)
on conflict (patient_id, dietitian_id) do update
set
  is_primary = true,
  updated_at = timezone('utc', now());

commit;
