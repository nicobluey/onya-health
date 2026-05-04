create table if not exists public.meal_planner_recipes (
  id text primary key,
  title text not null,
  description text,
  image_url text,
  ingredients jsonb not null default '[]'::jsonb,
  instructions jsonb not null default '[]'::jsonb,
  calories integer,
  protein integer,
  carbs integer,
  fat integer,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  dietary_tags text[] not null default '{}',
  allergens text[] not null default '{}',
  prep_time_minutes integer,
  estimated_cost text,
  source jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_meal_planner_recipes_meal_type on public.meal_planner_recipes(meal_type);
create index if not exists idx_meal_planner_recipes_dietary_tags on public.meal_planner_recipes using gin(dietary_tags);
create index if not exists idx_meal_planner_recipes_allergens on public.meal_planner_recipes using gin(allergens);

