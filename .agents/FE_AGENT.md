# FE Agent Guide (Patient + Dietitian Profiles)

## Purpose
Keep patient and dietitian profile rendering production-safe, database-backed, and non-hardcoded.

## Non-negotiables
- Never hardcode patient names, emails, phone numbers, or dietitian identity in UI components.
- Always consume profile identity from API payloads (`/api/patient/bootstrap`, login/register/setup responses).
- Do not assume a single dietitian; treat dietitian as dynamic assigned data.
- Profile photos must come from storage URLs/paths, not embedded blobs/base64 in app state.

## Active API contract
Patient payload (`payload.patient`) shape used by UI:
- `fullName`
- `firstName`
- `lastName`
- `email`
- `dob`
- `phone`
- `address`
- `profilePhotoPath`
- `profilePhotoUrl`

Dietitian payload (`payload.dietitian`) shape used by UI:
- `id`
- `fullName`
- `phone`
- `credentials`
- `bio`
- `profilePhotoPath`
- `profilePhotoUrl`

## Current frontend implementation
- `frontend/src/pages/PatientPortalPage.tsx`
  - Normalizes `payload.patient` and `payload.dietitian`.
  - Stores patient in `patient` state and assigned dietitian in `primaryDietitian` state.
  - Bottom-left sidebar profile now routes to Account settings.
  - Bottom-left sidebar avatar renders uploaded patient profile image when present, else initials fallback.
  - Account settings are editable and persisted via `POST /api/patient/profile`.
  - Account settings supports editing:
    - full name
    - email
    - DOB
    - phone
    - address
    - profile photo
  - When profile email is changed, frontend stores returned rotated patient token from API response.
  - Passes dietitian through to:
    - `OnboardingFlow`
    - `WeightLossResetDashboard`
    - `HomeTab` -> `PatientDashboardWeightLossCard`
  - Home/Consult/Account timeline uses a synthetic recurring nutrition consult entry when no explicit nutrition consult request row exists yet.
- `frontend/src/pages/PatientLoginPage.tsx`
  - supports magic-link-first login:
    - requests link via `/api/patient/magic-link/request`
    - consumes token from URL via `/api/patient/magic-link/consume`
- `frontend/src/components/FlowSteps.tsx`
  - details step includes address
  - calls `/api/patient/account-exists` before checkout and blocks if account already exists.
  - shows direct sign-in CTA when duplicate account is detected.
  - certificate duration selector is capped to 7 days (no `>7 days` option).
- `frontend/src/weight-loss-reset/components/ProfileAvatar.tsx`
  - Mandatory avatar component for fallback behavior.
  - If image fails/missing: fallback to secondary URL (if provided), then initials avatar.

## Styling + fallback rules
- If no assigned dietitian payload is present, UI copy must remain neutral:
  - use `"Your dietitian"` labels
  - use fallback avatar (not broken image icon)
- Keep fallback photo URL centralized in:
  - `frontend/src/weight-loss-reset/constants.ts`
  - `DEFAULT_DIETITIAN_PROFILE_IMAGE_URL`
- Production fallback is `/felicity-profile.webp` from `frontend/public`.

## Regression checks (before deploy)
1. Login and `GET /api/patient/bootstrap` returns patient + dietitian.
2. Onboarding and dashboard show assigned dietitian name/photo when available.
3. Missing photo still renders clean initials avatar.
4. Account settings allows update for full name, DOB, phone, address, profile photo.
5. Details step blocks checkout for existing account email/phone and shows sign-in guidance.
6. No hardcoded patient placeholders (`John`, `john@gmail.com`, etc.) remain.
7. `npm run build` succeeds.
8. Consult tab shows `Latest consults` including recurring nutrition consult visibility.
9. Account tab status chip colors follow:
   - approved/issued -> green
   - pending review -> yellow
   - awaiting payment -> gray
