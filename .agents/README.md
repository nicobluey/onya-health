# .agents Notes

This folder tracks production incidents, regressions, and applied fixes so future deploys keep behavior stable.

## Mandatory Deploy Policy

- Always deploy to production aliases, not random preview subdomains.
- Every live release must be aliased to all three:
  - `onyahealth.com.au`
  - `www.onyahealth.com.au`
  - `onya-health.vercel.app`
- If alias assignment fails, treat deploy as incomplete and resolve before closing work.

## Agent references

- `FE_AGENT.md`: frontend implementation contract and regression checks.
- `BE_AGENT.md`: backend/data-model contract, migration references, and API expectations.

## Meal-Plan Database Architecture (Current)

- Primary recipe table: `meal_planner_recipes`
  - Core columns used by product:
    - identity/meta: `id`, `title`, `description`, `meal_type`, `generated_by`, `source_provider`, `is_active`
    - nutrition: `calories`, `protein`, `carbs`, `fat`
    - recipe content: `ingredients` (jsonb), `instructions` (jsonb), `dietary_tags`, `allergens`
    - prep logistics: `prep_time_minutes`, `cook_time_minutes`, `total_time_minutes`, `serves`, `estimated_cost`
    - media: `image_url` (public URL only, no base64 blobs)
    - provenance: `source` (jsonb)
    - recency: `updated_at`
- Meal-plan cache table: `meal_plan_generation_cache`
  - Stores generated weekly bundle snapshots by `cache_key` and `intake_hash`.
  - Bundle keeps `mealPlan`, `recipeIds`, and compact recipe metadata for hydration/reuse.
- Event fallback table: `request_events`
  - Secondary source for recovering historical cache payloads when needed.

### Image storage strategy (required)

- Recipe images must be persisted as Supabase Storage objects and stored in DB as public `.webp` URLs.
- Do not persist large `data:image/...;base64,...` payloads to `meal_planner_recipes.image_url`.
- Upserts must preserve existing `image_url` when incoming payload omits image fields.
- APD/legacy recipe imagery must not be reintroduced into generated catalogs.

## Process (mandatory)

1. Add an entry to `fixes-log.md` before deploying when a bug/regression is fixed.
2. Include:
   - user-visible symptom
   - root cause
   - exact files/areas changed
   - verification steps
3. If a fix includes data or migration work, record the SQL/script used and result summary.

## Current focus

- Keep meal-plan generation backward-compatible with historical cached data.
- Keep meal image persistence stable (no null-clobbering during cache hydration/upsert).
