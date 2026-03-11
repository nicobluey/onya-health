# Repo Structure

## Top Level
- `frontend/`: React + Vite web application.
- `backend/`: Runtime libraries and local backend server entrypoint.
- `api/`: Vercel serverless API entrypoint and API-focused helpers.
- `docs/`: Architecture and engineering notes.

## Frontend
- `frontend/src/app/`: App shell and route resolution.
  - `AppRouter.tsx`: central route switching for web pages and consult flow.
- `frontend/src/pages/`: page-level components.
  - `HomePage.tsx`
  - `PatientLoginPage.tsx`
  - `PatientPortalPage.tsx`
  - `PatientResetPasswordPage.tsx`
- `frontend/src/components/`: shared UI sections used across pages.
- `frontend/src/components/blog/`: blog rendering components.
- `frontend/src/patient-portal/`: patient portal domain model + feature components.
  - `model.ts`: shared types, constants, and domain utilities.
  - `home/HomeTab.tsx`: home tab composition and sub-sections.
- `frontend/src/lib/`: frontend infrastructure utilities (`api.ts`).

## Backend
- `backend/lib/`: core backend services and adapters.
  - `auth.js`, `patient-auth.js`, `doctor-auth.js`
  - `storage.js`, `email.js`, `email-templates.js`
  - `notes.js`, `pdf.js`, `risk.js`
- `backend/server.js`: local backend entrypoint.

## API (Vercel)
- `api/index.js`: serverless handler and route orchestration.
- `api/lib/`: API-level helper modules.
  - `patient-snapshot.js`: patient certificate/profile snapshot and sync helpers.

## Conventions
- Keep page components in `frontend/src/pages`.
- Keep cross-page domain logic in feature folders (e.g. `patient-portal/model.ts`).
- Keep API adapters/helpers in `api/lib` and service logic in `backend/lib`.
- Avoid duplicate utility logic across page files.
