create table if not exists public.doctor_profile_assets (
  doctor_email text primary key,
  current_signature_path text,
  current_signature_mime_type text,
  updated_at timestamptz not null default now()
);

alter table public.doctor_profile_assets enable row level security;

revoke all on table public.doctor_profile_assets from anon, authenticated;
grant all on table public.doctor_profile_assets to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'doctor-signatures',
  'doctor-signatures',
  false,
  750000,
  array['image/png', 'image/jpeg']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
