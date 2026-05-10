-- Add address support for patient profile settings and duplicate-account checks.

alter table if exists public.patients
  add column if not exists address text;

-- Backfill from latest medical certificate request when available.
with latest_by_email as (
  select distinct on (lower(patient_email))
    lower(patient_email) as patient_email,
    nullif(trim(patient_address), '') as patient_address
  from public.medical_certificate_requests
  where patient_email is not null
  order by lower(patient_email), request_id desc
)
update public.patients p
set address = coalesce(p.address, latest_by_email.patient_address)
from latest_by_email
where lower(p.email) = latest_by_email.patient_email
  and coalesce(trim(p.address), '') = ''
  and latest_by_email.patient_address is not null;

create index if not exists idx_patients_phone on public.patients(phone);
