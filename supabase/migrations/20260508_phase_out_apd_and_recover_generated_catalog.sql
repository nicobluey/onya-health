begin;

alter table public.meal_planner_recipes
  add column if not exists generated_by text,
  add column if not exists source_provider text,
  add column if not exists is_active boolean not null default true;

with cache_recipe_rows as (
  select
    m.updated_at as source_ts,
    jsonb_array_elements(m.bundle->'recipes') as recipe_json
  from public.meal_plan_generation_cache m
  where jsonb_typeof(m.bundle->'recipes') = 'array'

  union all

  select
    r.created_at as source_ts,
    jsonb_array_elements(r.payload->'bundle'->'recipes') as recipe_json
  from public.request_events r
  where r.event_type = 'MEAL_PLAN_CACHE_V1'
    and jsonb_typeof(r.payload->'bundle'->'recipes') = 'array'
),
normalized_cache_recipes as (
  select
    nullif(trim(recipe_json->>'id'), '') as id,
    nullif(trim(recipe_json->>'title'), '') as title,
    nullif(trim(recipe_json->>'description'), '') as description,
    nullif(
      trim(
        coalesce(
          recipe_json->>'imageUrl',
          recipe_json->>'image_url',
          recipe_json->'source'->>'image_url',
          recipe_json->'source'->>'imageUrl',
          ''
        )
      ),
      ''
    ) as image_url,
    case
      when jsonb_typeof(recipe_json->'ingredients') = 'array' then recipe_json->'ingredients'
      else '[]'::jsonb
    end as ingredients,
    case
      when jsonb_typeof(recipe_json->'instructions') = 'array' then recipe_json->'instructions'
      else '[]'::jsonb
    end as instructions,
    case when coalesce(recipe_json->>'calories', '') ~ '^-?\d+(\.\d+)?$' then round((recipe_json->>'calories')::numeric)::int end as calories,
    case when coalesce(recipe_json->>'protein', '') ~ '^-?\d+(\.\d+)?$' then round((recipe_json->>'protein')::numeric)::int end as protein,
    case when coalesce(recipe_json->>'carbs', '') ~ '^-?\d+(\.\d+)?$' then round((recipe_json->>'carbs')::numeric)::int end as carbs,
    case when coalesce(recipe_json->>'fat', '') ~ '^-?\d+(\.\d+)?$' then round((recipe_json->>'fat')::numeric)::int end as fat,
    case lower(coalesce(recipe_json->>'mealType', recipe_json->>'meal_type', ''))
      when 'breakfast' then 'breakfast'
      when 'lunch' then 'lunch'
      when 'dinner' then 'dinner'
      when 'snack' then 'snack'
      else 'dinner'
    end as meal_type,
    coalesce(
      (
        select array_agg(distinct entry)
        from jsonb_array_elements_text(
          case
            when jsonb_typeof(recipe_json->'dietaryTags') = 'array' then recipe_json->'dietaryTags'
            when jsonb_typeof(recipe_json->'dietary_tags') = 'array' then recipe_json->'dietary_tags'
            else '[]'::jsonb
          end
        ) as entry
      ),
      '{}'::text[]
    ) as dietary_tags,
    coalesce(
      (
        select array_agg(distinct entry)
        from jsonb_array_elements_text(
          case
            when jsonb_typeof(recipe_json->'allergens') = 'array' then recipe_json->'allergens'
            else '[]'::jsonb
          end
        ) as entry
      ),
      '{}'::text[]
    ) as allergens,
    case when coalesce(recipe_json->>'prepTimeMinutes', '') ~ '^-?\d+(\.\d+)?$' then round((recipe_json->>'prepTimeMinutes')::numeric)::int end as prep_time_minutes,
    case when coalesce(recipe_json->>'cookTimeMinutes', '') ~ '^-?\d+(\.\d+)?$' then round((recipe_json->>'cookTimeMinutes')::numeric)::int end as cook_time_minutes,
    case when coalesce(recipe_json->>'totalTimeMinutes', '') ~ '^-?\d+(\.\d+)?$' then round((recipe_json->>'totalTimeMinutes')::numeric)::int end as total_time_minutes,
    case when coalesce(recipe_json->>'serves', '') ~ '^-?\d+(\.\d+)?$' then round((recipe_json->>'serves')::numeric, 2) end as serves,
    nullif(trim(coalesce(recipe_json->>'estimatedCost', recipe_json->>'estimated_cost', '')), '') as estimated_cost,
    case
      when jsonb_typeof(recipe_json->'source') = 'object' then recipe_json->'source'
      else '{}'::jsonb
    end as source,
    source_ts
  from cache_recipe_rows
),
dedup_cache_recipes as (
  select
    *,
    row_number() over (partition by id order by source_ts desc nulls last) as rn
  from normalized_cache_recipes
  where id is not null
    and title is not null
    and jsonb_array_length(ingredients) > 0
)
insert into public.meal_planner_recipes (
  id,
  title,
  description,
  image_url,
  ingredients,
  instructions,
  calories,
  protein,
  carbs,
  fat,
  meal_type,
  dietary_tags,
  allergens,
  prep_time_minutes,
  cook_time_minutes,
  total_time_minutes,
  serves,
  estimated_cost,
  source,
  updated_at
)
select
  id,
  title,
  description,
  image_url,
  ingredients,
  instructions,
  calories,
  protein,
  carbs,
  fat,
  meal_type,
  dietary_tags,
  allergens,
  prep_time_minutes,
  cook_time_minutes,
  total_time_minutes,
  serves,
  estimated_cost,
  source,
  timezone('utc', now())
from dedup_cache_recipes
where rn = 1
on conflict (id) do update
set
  title = excluded.title,
  description = excluded.description,
  image_url = coalesce(excluded.image_url, public.meal_planner_recipes.image_url),
  ingredients = excluded.ingredients,
  instructions = excluded.instructions,
  calories = excluded.calories,
  protein = excluded.protein,
  carbs = excluded.carbs,
  fat = excluded.fat,
  meal_type = excluded.meal_type,
  dietary_tags = excluded.dietary_tags,
  allergens = excluded.allergens,
  prep_time_minutes = excluded.prep_time_minutes,
  cook_time_minutes = excluded.cook_time_minutes,
  total_time_minutes = excluded.total_time_minutes,
  serves = excluded.serves,
  estimated_cost = excluded.estimated_cost,
  source = case
    when public.meal_planner_recipes.source = '{}'::jsonb then excluded.source
    else public.meal_planner_recipes.source || excluded.source
  end,
  updated_at = timezone('utc', now());

update public.meal_planner_recipes
set source_provider = nullif(
  trim(
    lower(
      coalesce(
        source->>'provider',
        source->>'origin',
        source->>'generator',
        source->>'label',
        case
          when lower(coalesce(source->>'url', '')) like '%dietitiansaustralia.org.au%' then 'dietitians-australia'
          else ''
        end
      )
    )
  ),
  ''
);

update public.meal_planner_recipes
set generated_by =
  case
    when lower(coalesce(source->>'url', '')) like '%dietitiansaustralia.org.au%'
      or lower(coalesce(source->>'provider', '')) like '%dietitians%'
      then 'legacy'
    when lower(coalesce(source->>'generatedBy', '')) = 'openai'
      or lower(coalesce(source->>'provider', '')) like '%openai%'
      or lower(coalesce(source->>'model', '')) like 'gpt%'
      then 'openai'
    when lower(coalesce(source->>'generatedBy', '')) = 'rules'
      or lower(coalesce(source->>'provider', '')) like '%rules-generated%'
      or lower(coalesce(source->>'provider', '')) in ('rules', 'ai-generated')
      then 'rules'
    else coalesce(generated_by, 'legacy')
  end;

update public.meal_planner_recipes
set is_active = case
  when coalesce(generated_by, 'legacy') in ('openai', 'rules') then true
  else false
end;

update public.meal_planner_recipes
set generated_by = 'legacy',
    is_active = false
where lower(coalesce(source->>'url', '')) like '%dietitiansaustralia.org.au%'
   or lower(coalesce(source->>'provider', '')) like '%dietitians%';

create index if not exists idx_meal_planner_recipes_active_generated_meal_type
  on public.meal_planner_recipes(is_active, generated_by, meal_type);

create index if not exists idx_meal_planner_recipes_generated_updated
  on public.meal_planner_recipes(generated_by, updated_at desc);

create index if not exists idx_meal_planner_recipes_source_provider
  on public.meal_planner_recipes(source_provider);

commit;
