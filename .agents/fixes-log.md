# Fixes Log

## 2026-05-08 - GPT-only catalog enforcement, swap recovery, and generation progress fix

### Symptoms

- Swap options were missing large parts of previously generated meals.
- Legacy APD recipes were resurfacing in active meal plans and swaps.
- "Building your updated weekly plan" progress UI could appear stuck around `6%`.

### Root causes

1. Recipe eligibility was not enforced consistently at all read paths, so APD/legacy rows could still be hydrated from cache and reused.
2. Catalog hydration requested a small slice (`limit=72`), which constrained swap candidate variety.
3. Generation progress effect in dashboard depended on `generationProgress`, causing interval restarts and apparent stalling.
4. Historical generated recipes were not fully backfilled from cache/event bundle rows into the primary recipe table.

### Files changed

- `backend/lib/storage.js`
  - enforced GPT/rules eligibility at Supabase read layer
  - added resilient query filtering fallback for missing columns
  - expanded recipe-id normalization and chunked `id IN (...)` fetches for large historical catalogs
  - raised patient cache list bounds for larger historical recovery windows
- `api/index.js`
  - tightened generated-recipe detection; APD URLs/providers are now explicitly excluded
  - prevented legacy/APD recipes from being rehydrated/backfilled into generated catalog paths
  - increased catalog recovery breadth and enabled generated global fallback in patient catalog route
  - adjusted recipe normalization so rules fallback does not overwrite existing OpenAI provenance
- `frontend/src/pages/PatientPortalPage.tsx`
  - increased patient catalog hydration request from `72` to `420`
- `frontend/src/weight-loss-reset/components/WeightLossResetDashboard.tsx`
  - fixed generation progress floor/timing behavior and removed self-reset loop behavior
- `supabase/migrations/20260508_phase_out_apd_and_recover_generated_catalog.sql`
  - adds/normalizes `generated_by`, `source_provider`, `is_active`
  - backfills recipes from `meal_plan_generation_cache` and `request_events` bundles
  - deactivates APD/legacy recipes and indexes active generated read paths

### Verification

1. `npm run build` succeeds.
2. Live DB post-migration checks:
   - APD active leaks = `0`
   - Active generated recipes remain available (OpenAI + rules provenance)
3. Cache-derived recipe recovery repopulates generated recipe rows before catalog reads.

## 2026-05-08 - Meal history and image compatibility recovery

### Symptoms

- Older generated meal plans were not showing for some patients.
- Recipe images from previously generated plans were missing.

### Root causes

1. The API accepted only WebP image formats (`.webp` or `data:image/webp`), so legacy `.png`/`.jpg`/other valid image URLs were dropped.
2. `GET /api/patient/meal-plan/latest` returned `found: false` if the latest cache row could not hydrate, without falling back to older valid cache rows.
3. `GET /api/patient/meal-plan/catalog` filtered out recipes without resolved image URLs, reducing usable historical catalog coverage.
4. Frontend generation flow blocked applying a valid meal plan when image coverage was below a hard threshold.

### Files changed

- `api/index.js`
  - relaxed supported recipe image formats (HTTP + data URI)
  - added hydration fallback to older patient cache rows for `/patient/meal-plan/latest`
  - removed image-only filter from `/patient/meal-plan/catalog`
  - updated recipe image proxy to serve non-WebP data URIs safely
- `frontend/src/pages/PatientPortalPage.tsx`
  - relaxed concrete image detection to include non-WebP formats
  - changed generation behavior to keep meal plan even with partial image coverage
- `frontend/src/weight-loss-reset/components/WeightLossResetDashboard.tsx`
  - relaxed concrete image detection to include non-WebP formats

### Verification

1. `npm run build` succeeds.
2. Supabase check confirms historical cache rows exist for affected patients.
3. API path now supports legacy image formats and older valid cache rows.
4. Frontend no longer discards generated meals when image coverage is incomplete.
