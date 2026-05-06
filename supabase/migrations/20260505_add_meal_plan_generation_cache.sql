begin;

create table if not exists public.meal_plan_generation_cache (
  cache_key text primary key,
  patient_email text not null,
  intake_hash text not null,
  source text not null default 'openai',
  stage text not null default 'ai_recipes_v2',
  bundle jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  last_used_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_meal_plan_generation_cache_patient_email
  on public.meal_plan_generation_cache(patient_email);

create index if not exists idx_meal_plan_generation_cache_intake_hash
  on public.meal_plan_generation_cache(intake_hash);

alter table public.meal_planner_recipes
  add column if not exists cook_time_minutes integer,
  add column if not exists total_time_minutes integer,
  add column if not exists serves numeric(6,2);

commit;
