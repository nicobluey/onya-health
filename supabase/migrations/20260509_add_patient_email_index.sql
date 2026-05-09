begin;

alter table public.patients
  add column if not exists email text;

update public.patients p
set email = lower(u.email)
from auth.users u
where u.id = p.id
  and u.email is not null
  and (
    p.email is null
    or lower(p.email) <> lower(u.email)
  );

create unique index if not exists idx_patients_email_unique
  on public.patients (lower(email))
  where email is not null;

create index if not exists idx_patients_owner_id
  on public.patients (owner_id);

commit;
