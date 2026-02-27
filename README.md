# Onya Health

Onya Health is a React + Vite frontend with a Node backend for medical certificate review workflows.

## What is implemented

- Multi-service landing pages (`/doctor`, `/nutritionist`, `/psychologist`)
- Booking flow frontend
- Backend medical certificate pipeline:
  - User checkout submits certificate request to backend
  - Doctor notification email is triggered
  - Doctor logs in to a separate portal
  - Doctor sees an open queue with risk factor
  - Doctor reviews prefilled certificate data and approves/denies
  - Patient receives decision email
  - On approval, patient receives a PDF certificate attachment

## Project structure

- `src/` - frontend React app
- `backend/server.js` - backend HTTP server
- `backend/lib/` - auth, storage, risk, PDF, email modules
- `backend/doctor-portal/` - separate doctor login + queue + review pages
- `backend/data/db.json` - persisted request data (created at runtime)

## Local development

### Frontend

```bash
npm install
npm run dev
```

Frontend default: `http://localhost:5173`

### Backend

```bash
npm run backend
```

Backend default: `http://localhost:8787`

Doctor portal login: `http://localhost:8787/doctor/login`

## Environment variables (backend)

Set these before `npm run backend` in production:

- `PORT` - backend port (default `8787`)
- `APP_BASE_URL` - public URL for doctor links in emails
- `CORS_ORIGIN` - allowed frontend origin (default `*`)
- `DOCTOR_LOGIN_EMAIL` - doctor portal login email
- `DOCTOR_LOGIN_PASSWORD` - doctor portal login password
- `DOCTOR_DISPLAY_NAME` - doctor display name in login payload
- `DOCTOR_SESSION_SECRET` - secret for doctor auth tokens
- `DOCTOR_NOTIFICATION_EMAILS` - comma-separated review notification emails
- `EMAIL_FROM` - sender email display
- `RESEND_API_KEY` - optional; when missing, email payloads are written to `backend/data/outbox.log`
- `SUPABASE_URL` - optional; when set with service key, backend uses Supabase tables
- `SUPABASE_SERVICE_ROLE_KEY` - required with `SUPABASE_URL` for backend writes
- `OPENAI_API_KEY` - optional; enables AI doctor-note generation in review portal
- `OPENAI_NOTES_MODEL` - optional; defaults to `gpt-5-nano`
- `LOG_LEVEL` - optional; one of `debug`, `info`, `warn`, `error` (default `info`)
- `LOG_TO_FILE` - optional; `1` to write logs to file, `0` to disable file logging (default `1`)
- `BACKEND_LOG_FILE` - optional; log file path (default `backend/data/backend.log`)

When `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set, backend writes to:
- `service_requests`
- `medical_certificate_requests`
- `request_events`

If they are not set, backend falls back to local file storage in `backend/data/db.json`.

## Email delivery behavior

- If `RESEND_API_KEY` is set: backend sends real emails via Resend API.
- If `RESEND_API_KEY` is missing: backend uses mock mode and writes messages to `backend/data/outbox.log`.

When doctor clicks **Approve & Send Certificate**, patient delivery follows the same rule above.

## Backend logging

- Request, audit, decision, and email dispatch logs are written to console.
- If `LOG_TO_FILE=1`, logs are also written to `backend/data/backend.log` (or `BACKEND_LOG_FILE`).

## Frontend -> backend API base URL

Frontend checkout uses:

- `VITE_API_BASE_URL` (optional)

If unset, frontend submits to same-origin `/api/certificates`.
Set this when frontend and backend run on different domains.

## Supabase test record

Root `.env` supports:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY`
- optional `SUPABASE_TEST_TABLE` (defaults to `connection_checks`)

Before running the test insert, execute this SQL in your Supabase project SQL editor:

- `supabase/migrations/20260227_create_connection_checks.sql`

Run:

```bash
npm run supabase:test-record
```

This attempts an insert and prints the inserted row (or error response).

## Docker

Run full stack (frontend + backend) in Docker:

```bash
docker compose up --build
```

or

```bash
npm run dcup
```

or directly from the repo root:

```bash
./dcup
```

This uses:

- `Dockerfile.frontend` (frontend)
- `backend/Dockerfile` (backend)
- `docker-compose.yml`
- `docker/nginx.frontend.conf` (SPA routing for `/doctor`, `/nutritionist`, `/psychologist`)
- persistent volume mapping `./backend/data:/app/backend/data`

After launch:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8787`
- Doctor portal: `http://localhost:8787/doctor/login`

## Backend API summary

- `POST /api/certificates` - create certificate request
- `POST /api/doctor/login` - doctor login
- `GET /api/doctor/certificates?status=pending` - doctor queue
- `GET /api/doctor/certificates/:id` - request detail (prefilled)
- `POST /api/doctor/certificates/:id/auto-notes` - AI doctor note draft
- `POST /api/doctor/certificates/:id/more-info` - AI follow-up questions draft
- `POST /api/doctor/certificates/:id/request-more-info` - send patient a more-info request email
- `POST /api/doctor/certificates/:id/pdf-preview` - generate doctor PDF preview with notes
- `POST /api/doctor/certificates/:id/decision` - approve/deny
- `GET /api/health` - health check

## Vercel note

Vercel does not deploy Docker containers directly for this style of custom Node server.  
Recommended deployment setup:

- Deploy frontend on Vercel
- Deploy this backend container on a container host (Railway/Render/Fly/etc.)
- Point frontend to backend with `VITE_API_BASE_URL`
