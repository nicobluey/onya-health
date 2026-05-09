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
  - Passes dietitian through to:
    - `OnboardingFlow`
    - `WeightLossResetDashboard`
    - `HomeTab` -> `PatientDashboardWeightLossCard`
- `frontend/src/weight-loss-reset/components/ProfileAvatar.tsx`
  - Mandatory avatar component for fallback behavior.
  - If image fails/missing: fallback to initials avatar.

## Styling + fallback rules
- If no assigned dietitian payload is present, UI copy must remain neutral:
  - use `"Your dietitian"` labels
  - use fallback avatar (not broken image icon)
- Keep fallback photo URL centralized in:
  - `frontend/src/weight-loss-reset/constants.ts`
  - `DEFAULT_DIETITIAN_PROFILE_IMAGE_URL`

## Regression checks (before deploy)
1. Login and `GET /api/patient/bootstrap` returns patient + dietitian.
2. Onboarding and dashboard show assigned dietitian name/photo when available.
3. Missing photo still renders clean initials avatar.
4. No hardcoded patient placeholders (`John`, `john@gmail.com`, etc.) remain.
5. `npm run build` succeeds.
