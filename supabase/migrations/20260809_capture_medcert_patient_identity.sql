begin;

alter table public.medical_certificate_requests
  add column if not exists patient_dob date,
  add column if not exists patient_phone text,
  add column if not exists patient_address text,
  add column if not exists raw_submission jsonb;

update public.patients patient
set
  phone = profile.phone,
  updated_at = now()
from public.profiles profile
where profile.id = patient.id
  and nullif(trim(profile.phone), '') is not null
  and nullif(trim(patient.phone), '') is null;

update public.medical_certificate_requests medical
set
  patient_dob = coalesce(medical.patient_dob, profile.dob),
  patient_phone = coalesce(
    nullif(trim(medical.patient_phone), ''),
    nullif(trim(profile.phone), ''),
    nullif(trim(patient.phone), '')
  ),
  patient_address = coalesce(
    nullif(trim(medical.patient_address), ''),
    case
      when patient.address is null or patient.address = '{}'::jsonb then null
      when jsonb_typeof(patient.address) = 'string' then patient.address #>> '{}'
      else patient.address::text
    end
  )
from public.service_requests request
left join public.profiles profile on profile.id = request.patient_id
left join public.patients patient on patient.id = request.patient_id
where request.id = medical.request_id;

update public.medical_certificate_requests
set raw_submission = jsonb_strip_nulls(
  jsonb_build_object(
    'patient', jsonb_build_object(
      'fullName', patient_full_name,
      'email', patient_email,
      'dob', patient_dob,
      'phone', patient_phone,
      'address', patient_address
    ),
    'consult', jsonb_build_object(
      'purpose', work_or_study_context,
      'symptom', symptoms,
      'description', coalesce(supporting_notes, consult_reason),
      'startDate', certificate_start_date,
      'durationDays', days_requested
    )
  )
)
where raw_submission is null;

create index if not exists medical_certificate_requests_patient_email_idx
  on public.medical_certificate_requests (patient_email);

create index if not exists idx_patients_phone
  on public.patients (phone);

commit;
