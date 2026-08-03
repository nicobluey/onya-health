# Backend

Onya Health uses a compact Node backend for local development and a Vercel-style API entrypoint for production-style routing.

## Entry Points

- `api/index.js` - main API handler for Vercel/serverless deployment.
- `backend/server.js` - local Node HTTP server used by `npm run backend`.
- `backend/lib/storage.js` - local JSON and Supabase storage mapping.
- `backend/lib/email.js` and `backend/lib/email-templates.js` - email transport and templates.
- `backend/lib/patient-auth.js` and `backend/lib/doctor-auth.js` - patient/doctor token helpers.
- `backend/lib/pdf.js` - certificate PDF generation.
- `backend/lib/meal-plan-ai.js` - AI-supported meal-plan helpers.

## Run Locally

```bash
npm run backend
```

Default backend URL:

```text
http://localhost:8787
```

Frontend development server:

```bash
npm run dev -- --port 5173
```

## Important API Areas

- Patient auth and portal:
  - `POST /api/patient/login`
  - `POST /api/patient/magic-link/request`
  - `POST /api/patient/magic-link/consume`
  - `POST /api/patient/password/reset/request`
  - `POST /api/patient/password/reset/confirm`
  - `POST /api/patient/account-exists`
  - `POST /api/patient/profile`
  - `GET /api/patient/bootstrap`
- Booking and certificates:
  - `POST /api/certificates`
  - `POST /api/checkout/confirm`
  - `GET /api/patient/requests/:id/certificate.pdf`
  - `GET /api/certificates/verify/:id`
- Doctor portal:
  - `POST /api/doctor/login`
  - `POST /api/doctor/register`
  - `POST /api/doctor/password/reset/request`
  - `POST /api/doctor/password/reset/confirm`
  - `GET /api/doctor/certificates`
  - `POST /api/doctor/certificates/:id/decision`
  - `POST /api/doctor/certificates/:id/request-more-info`
- Meal planning:
  - patient meal-plan latest/cache/catalog routes under `/api/patient/meal-plan/*`

## Environment Variables

Common production variables:

- `PORT`
- `APP_BASE_URL`
- `CORS_ORIGIN`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `OPENAI_API_KEY`
- `DOCTOR_SESSION_SECRET`
- `PATIENT_SESSION_SECRET`

Keep secrets out of logs and documentation.

## Doctor Email Routing

- Account welcome and password-reset messages are sent to the doctor's own account email.
- New certificate-review and patient-reply notifications are sent to the explicit
  `DOCTOR_NOTIFICATION_EMAILS` list plus approved practitioner accounts.
- Pending or rejected practitioner accounts must not receive patient or certificate
  notifications. Addresses explicitly configured in `DOCTOR_NOTIFICATION_EMAILS` are
  treated as operator-managed recipients and do not require a portal account.

## Storage Modes

When Supabase service credentials are present, production data should be read/written through Supabase tables.

Without Supabase credentials, local development falls back to JSON files under:

```text
backend/data/
```

Mock email output is written to the local outbox/log paths when a real email provider is not configured.

## Safety Requirements

- Patient-facing auth routes must return controlled JSON and avoid leaking account existence in reset flows.
- Practitioner accounts must not become active from public signup without admin approval.
- Certificate issue must remain subject to clinician review and clinical appropriateness.
- Pricing and certificate duration caps must be enforced server-side, not just in React.
- Meal-plan generation must validate calories, macros, serving counts, and ingredient consistency before display.

## Validation

After backend changes:

```bash
npm run build
```

When relevant and environment variables permit, run local API smoke checks against `http://localhost:8787`.

Record production bug fixes in `.agents/fixes-log.md` before closing work.
