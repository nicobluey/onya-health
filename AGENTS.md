---
name: onya-health-agents
description: Persistent project briefing for Codex agents working in the Onya Health repository.
version: 1.0.0
---

# AGENTS.md - Onya Health Mission Briefing

This is the root instruction file for agent work in this repository. Read it before code or documentation changes so fixes stay aligned with the current product, clinical-risk posture, and validation expectations.

## Commands First

Frontend and shared TypeScript:

```bash
npm install
npm run build
npm run lint
npm audit --audit-level=high
npm run dev -- --port 5173
```

Backend:

```bash
npm run backend
```

Local URLs:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8787`
- Doctor portal: `http://localhost:8787/doctor/login`
- Patient portal: `http://localhost:5173/patient`

Docker:

```bash
docker compose up --build
docker compose ps
```

Static asset and SEO utilities:

```bash
npm run sitemap:generate
npm run images:webp
```

## First Files To Read

For any code change:

1. `SKILL.md` - coding guardrails.
2. `PLANS.md` - current execution plan, validation state, and file map.
3. `DESIGN.md` - Onya visual system, copy rules, and asset guidance.
4. `.agents/README.md` - deployment and incident-log requirements.
5. The touched source files only.

For frontend work, usually inspect:

- `frontend/src/app/AppRouter.tsx`
- `frontend/src/index.css`
- `frontend/src/pages/*`
- `frontend/src/components/*`
- `frontend/src/consult-flow/*`
- `frontend/src/weight-loss-reset/*`

For backend/API work, usually inspect:

- `api/index.js`
- `backend/server.js`
- `backend/lib/storage.js`
- `backend/lib/email.js`
- `backend/lib/email-templates.js`
- `backend/lib/patient-auth.js`
- `backend/lib/doctor-auth.js`

## Project Context

Onya Health is an Australian telehealth platform for online medical-certificate consults, patient portal access, practitioner review, and nutrition/weight-loss support.

Active product surfaces:

- `/` - public marketing homepage.
- `/doctor` and medical-certificate landing aliases - certificate request landing pages.
- Certificate booking flow - desktop and mobile consult flow under `frontend/src/consult-flow`.
- `/patient-login`, `/patient/reset-password`, and `/patient` - patient auth and portal.
- `/doctor/login`, `/doctor/queue`, `/doctor/review` - static doctor portal pages served from `frontend/public/doctor` and backed by API routes.
- `/privacy`, `/terms`, `/trust`, `/blog`, `/health/*`, `/verify` - public content, policy, SEO, and certificate verification pages.

Core integrations:

- Supabase for production patient, dietitian, certificate, billing, and generated meal-plan data when configured.
- Local JSON storage under `backend/data/` as a fallback for development.
- Stripe for checkout and billing.
- Resend or SMTP-compatible email dispatch, with mock outbox fallback.
- OpenAI for doctor-note drafting, generated meal-plan support, and image-generation scripts when configured.

## Workflow Selection

Use the smallest relevant workflow from `SKILLS.md`; do not split work into separate FE/BE agent files. Broad bug batches should start with `PLANS.md`, then move through only the affected source areas.

Typical routing:

- UI, copy, routing, styling, booking, and portal changes -> Frontend Visual Pass or Medical Certificate Booking Pass.
- API, auth, storage, email, Stripe, Supabase, PDF, and doctor-portal backend changes -> Backend/API Pass.
- Public content, metadata, sitemap, robots, blog, landing-page copy, and crawlability -> SEO And Crawlability Pass.
- Documentation-only refreshes -> Documentation Pass.

## Frontend Architecture

Keep frontend changes simple and consistent:

- `frontend/src/app/AppRouter.tsx` - route selection and landing aliases.
- `frontend/src/pages/` - route-level page composition.
- `frontend/src/components/` - shared sections and UI primitives.
- `frontend/src/consult-flow/` - booking flow state, service config, pricing, and desktop/mobile views.
- `frontend/src/patient-portal/` - patient portal shared model and home components.
- `frontend/src/weight-loss-reset/` - onboarding, meal planning, dashboard, recipe catalog, and local state helpers.
- `frontend/src/blogs/` - Markdown article content and post metadata.
- `frontend/src/index.css` - global Onya tokens, utilities, and major responsive rules.

Do not add a router library, UI kit, state library, or unrelated design system unless explicitly requested.

## Backend Architecture

API and backend source is intentionally compact:

- `api/index.js` - Vercel-style API entrypoint and most production route handling.
- `backend/server.js` - local Node server wrapper.
- `backend/lib/storage.js` - local/Supabase storage mapping.
- `backend/lib/email*.js` - email transport and templates.
- `backend/lib/*auth*.js` - patient and doctor auth helpers.
- `backend/lib/pdf.js` - certificate PDF generation.
- `backend/lib/meal-plan-ai.js` - AI meal-plan support.
- `supabase/migrations/` - schema changes that must be applied before relying on new DB fields.

When touching auth, payment, profile, or certificate workflow code, preserve existing API contracts unless the UI and docs are updated in the same change.

## Clinical, Compliance, And Safety Boundaries

Never imply:

- medical certificates are instant, automatic, or guaranteed;
- a clinician will approve every request;
- nutrition plans are medical advice or clinically safe for all users without review;
- patient records can be deleted immediately in a way that conflicts with legal retention;
- doctor/practitioner accounts can be self-approved without admin verification.

Preferred wording:

- `Request a medical certificate online`
- `Submit your request for clinician review`
- `Issued where clinically appropriate`
- `A clinician reviews your information before an outcome is provided`

Any high-risk nutrition, auth, payment, or certificate workflow must fail closed with clear user-safe copy and server-side validation.

## Documentation Rules

Keep these files current:

- `AGENTS.md` when commands, architecture, or validation policy changes.
- `PLANS.md` after meaningful implementation or validation status changes.
- `DESIGN.md` when tokens, layout, assets, or copy rules change.
- `SKILLS.md` when repeatable workflows change.
- `.agents/fixes-log.md` before closing any production bug/regression fix.

Documentation-only tasks must not modify source files unless the user explicitly asks for both docs and implementation.

## Success Criteria

Before finishing implementation:

- Build passes with `npm run build`.
- Lint is run when the changed files are lint-covered.
- High-severity audit is run for dependency/security-sensitive work.
- Affected routes are checked on desktop and mobile.
- API/auth/payment fixes include at least one local route or helper smoke check where secrets and external services permit it.
- `.agents/fixes-log.md` records user-visible symptom, root cause, changed files, and verification for bug fixes.

## Deployment Policy

For live releases, deployment is incomplete until aliases are assigned to:

- `supadoc.com.au`
- `www.supadoc.com.au`
- `onya-health.vercel.app`

Do not treat a preview deployment alone as production complete. In Vercel, a deployment
with Environment `Production` can still be `Staged`; production is complete only when the
deployment detail page shows `Current` and the `Domains` section includes the live aliases.

If Vercel shows `Assigning Custom Domains: Skipped`, open the deployment actions menu and
choose `Promote`. Confirm that `supadoc.com.au`, `www.supadoc.com.au`, and `onya-health.vercel.app` are
listed in the promotion dialog before confirming. After promotion, verify the live site and
at least one changed production API behavior.

The team currently has had both `onya-health` and `repo` Vercel projects connected to the
same GitHub repository. Treat `onya-health` as the production project because it owns the
public domains. Keep Onya Health mail settings on the existing Onya Health domain unless
the mail system is explicitly migrated.
