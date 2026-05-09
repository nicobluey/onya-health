# BE Agent Guide (Patient + Dietitian Profile Model)

## Purpose
Backend profile identity must come from database tables and support many dietitians per patient over time.

## Database model (production)
- `patients`
  - canonical patient profile fields
  - includes: `id`, `owner_id`, `email`, `full_name`, `phone`, `profile_photo_path`, timestamps
- `dietitians`
  - dietitian directory
  - includes: `id`, `full_name`, `phone`, `credentials`, `bio`, `profile_photo_path`, `is_active`, timestamps
- `patient_dietitians`
  - assignment join table
  - includes: `patient_id`, `dietitian_id`, `is_primary`, `assigned_at`

## Key constraints/indexes
- unique primary assignment per patient (partial unique index on `patient_id where is_primary = true`)
- lookup indexes:
  - `patients(lower(email))` unique
  - `patients(owner_id)`
  - `patient_dietitians(patient_id)`
  - `patient_dietitians(dietitian_id)`

## Storage rules
- Profile photos/headshots are storage objects, not DB blobs.
- DB stores path only (for example `dietitians/felicity-profile.webp`).
- API derives public URL via Supabase storage public URL builder.

## Active server resolution path
Main resolver:
- `api/index.js` -> `resolvePatientProfileByEmail(...)`

Resolution order:
1. Find patient row by indexed `patients.email`.
2. Enrich with `profiles` row for `dob` and name fallback.
3. Resolve primary dietitian from `patient_dietitians`.
4. Fallback to first active dietitian if no primary assignment.
5. Final fallback to static dietitian object only if DB cannot resolve.

Returned API identity contract:
- `patient`: full profile object for UI
- `dietitian`: assigned primary dietitian profile object

## Sync points
When account/profile records are created/updated:
- `createPatientAccountViaSupabase(...)` and `upsertSupabasePatientMetadata(...)`
- both call `upsertSupabasePatientProfileRows(...)`
- this keeps `profiles` and `patients` in sync

## Migrations applied for this model
- `supabase/migrations/20260508_refactor_patient_dietitian_profiles.sql`
- `supabase/migrations/20260509_add_patient_email_index.sql`

## Operational checklist before deploy
1. Ensure migration files are applied to target project.
2. Confirm at least one active dietitian exists.
3. Confirm each active patient has a primary assignment or fallback assignment path works.
4. Verify auth endpoints return `{ patient, dietitian }`.
5. Smoke test `/api/patient/bootstrap` with a real token.
