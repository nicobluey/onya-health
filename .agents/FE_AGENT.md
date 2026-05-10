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
    - DOB
    - phone
    - address
    - profile photo
  - Email is read-only in base profile form and uses verification-link flow:
    - `POST /api/patient/profile/email-change/request`
    - consume link token from `email_change_token` query via `POST /api/patient/profile/email-change/consume`
  - On successful email-link consume, frontend rotates stored `onya_patient_email` + `onya_patient_token`.
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
- In the meal-plan dashboard, the "Crafted for you" personal-note card should also render the assigned dietitian photo/name badge.
- In the meal-plan dashboard, the "Crafted for you" card should render:
  - a prominent dietitian portrait (not tiny badge),
  - a personal note/quote from the assigned dietitian,
  - human copy that feels like a real practitioner, not generic placeholder text.
- Desktop sidebar profile chip must remain persistent across Home/Consult/Account; keep sidebar pinned (`sticky top-0 h-screen`) so the bottom profile card does not scroll out on long pages.

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
   - approved/issued/live -> green
   - pending review -> yellow
   - awaiting payment/default neutral -> blue brand-neutral
10. If nutrition plan is not started, Home hero should show locked nutrition upsell copy instead of implying active consult access.
