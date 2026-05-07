begin;

alter table public.meal_planner_recipes
  add column if not exists is_active boolean not null default true;

create index if not exists idx_meal_planner_recipes_is_active
  on public.meal_planner_recipes(is_active);

create index if not exists idx_meal_plan_generation_cache_patient_intake_last_used
  on public.meal_plan_generation_cache(patient_email, intake_hash, last_used_at desc);

create index if not exists idx_meal_plan_generation_cache_patient_updated
  on public.meal_plan_generation_cache(patient_email, updated_at desc);

create index if not exists idx_meal_plan_generation_cache_intake_updated
  on public.meal_plan_generation_cache(intake_hash, updated_at desc);

commit;
