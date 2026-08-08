-- Persist patient-entered clinical history and keep uploaded records private.

create table if not exists public.patient_clinical_profiles (
  patient_id uuid primary key references public.patients(id) on delete cascade,
  medical_history jsonb not null default '[]'::jsonb,
  allergies jsonb not null default '[]'::jsonb,
  medications jsonb not null default '[]'::jsonb,
  lifestyle_notes jsonb not null default '[]'::jsonb,
  test_results jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.patient_clinical_profiles enable row level security;

revoke all on table public.patient_clinical_profiles from anon, authenticated;
grant all on table public.patient_clinical_profiles to service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'patient-medical-records',
  'patient-medical-records',
  false,
  2500000,
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'image/heic',
    'image/heif'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
