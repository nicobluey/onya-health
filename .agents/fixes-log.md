# Fixes Log

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
