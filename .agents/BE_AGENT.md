# BE Agent Guide (Patient + Dietitian Profile Model)

## Purpose
Backend profile identity must come from database tables and support many dietitians per patient over time.

## Database model (production)
- `patients`
  - canonical patient profile fields
  - includes: `id`, `owner_id`, `email`, `full_name`, `phone`, `dob`, `address`, `profile_photo_path`, timestamps
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
- patient profile photos are uploaded by API from data-url payloads and stored in Supabase Storage; DB stores only `profile_photo_path`.
- Meal recipe images are storage URLs in `meal_planner_recipes.image_url`; do not keep base64 image blobs in table rows.

## Meal-plan recipe model (production)

- `meal_planner_recipes` is the single source of truth for generated recipes used by weekly plans and swap candidates.
- Generated catalog eligibility is constrained to:
  - `is_active = true`
  - `generated_by IN ('openai','rules')`
- `source` JSON is metadata only; image rendering should rely on `image_url` (public storage URL).
- Upsert rule: never overwrite an existing `image_url` with `null`/empty when a cache payload omits image fields.

## Deployment policy (mandatory)

- For live releases, deployment is incomplete until aliases are set to:
  - `onyahealth.com.au`
  - `www.onyahealth.com.au`
  - `onya-health.vercel.app`

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

## Auth + account flow (current)
- Primary sign-in path supports magic link:
  - `POST /api/patient/magic-link/request`
  - `POST /api/patient/magic-link/consume`
- Pre-check endpoint before checkout:
  - `POST /api/patient/account-exists` (email/phone collision guard)
- Profile update endpoint (authenticated):
  - `POST /api/patient/profile`
  - supports `fullName`, `dob`, `phone`, `address`, optional `profilePhotoDataUrl`
  - direct email mutation is blocked (`EMAIL_CHANGE_REQUIRES_CONFIRMATION`) to prevent unsafe lockout edits
- Email change verification flow:
  - `POST /api/patient/profile/email-change/request`
  - `POST /api/patient/profile/email-change/consume`
  - consume path updates:
    - Supabase auth email
    - `patients`/`profiles` identity rows
    - certificate email references
    - billing references + Stripe customer email + Stripe subscription metadata (`patient_email`)
  - returns rotated patient token for the new email.
- Checkout confirmation:
  - `POST /api/checkout/confirm` auto-creates patient account when missing and sends magic-link email after payment.

## Sync points
When account/profile records are created/updated:
- `createPatientAccountViaSupabase(...)` and `upsertSupabasePatientMetadata(...)`
- both call `upsertSupabasePatientProfileRows(...)`
- this keeps `profiles` and `patients` in sync
- these sync paths now include `address` and `profilePhotoPath`.

## Critical identity rule
- Do not re-sync canonical patient identity from legacy certificate drafts during bootstrap/me reads.
- `patients` + `profiles` are the source of truth for name/DOB/phone/address.
- Certificate draft data may be stale and must never overwrite canonical identity on page refresh.

## Certificate duration cap
- Duration is hard-capped to 7 days at all pricing/draft points:
  - `buildDraftCertificate(...)`
  - `stripePricingFromRequest(...)`
- This prevents frontend bypass and keeps billing/certificate issuance aligned.

## Migrations applied for this model
- `supabase/migrations/20260508_refactor_patient_dietitian_profiles.sql`
- `supabase/migrations/20260509_add_patient_email_index.sql`
- `supabase/migrations/20260511_add_patient_address_and_phone_index.sql`

## Operational checklist before deploy
1. Ensure migration files are applied to target project.
2. Confirm at least one active dietitian exists.
3. Confirm each active patient has a primary assignment or fallback assignment path works.
4. Verify auth endpoints return `{ patient, dietitian }`.
5. Smoke test `/api/patient/bootstrap` with a real token.
6. Smoke test profile email change and ensure returned token can still load `/api/patient/bootstrap`.
