begin;

create table if not exists public.patient_billing (
  patient_email text primary key,
  has_active_unlimited boolean not null default false,
  plan text not null default 'pay_as_you_go',
  subscription_status text not null default 'none',
  stripe_customer_id text,
  stripe_subscription_id text,
  cancel_at_period_end boolean not null default false,
  current_period_end timestamptz,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint patient_billing_plan_check check (plan in ('pay_as_you_go', 'unlimited'))
);

create index if not exists patient_billing_stripe_subscription_idx
  on public.patient_billing (stripe_subscription_id);

create index if not exists patient_billing_stripe_customer_idx
  on public.patient_billing (stripe_customer_id);

alter table public.patient_billing enable row level security;

commit;
