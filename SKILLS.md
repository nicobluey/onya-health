---
name: onya-health-workflows
description: Repeatable project workflows for Onya Health Codex sessions.
version: 1.0.0
---

# SKILLS.md - Onya Health Workflows

Read `SKILL.md` before writing code. Use this file for project-specific workflows.

## Frontend Visual Pass

Use when changing layout, copy, animation, media, or route-level UI.

1. Read `AGENTS.md`, `PLANS.md`, `DESIGN.md`, and the touched source files.
2. Keep Onya tokens in `frontend/src/index.css` as the source of truth.
3. Use public assets from `frontend/public` directly; do not add overlays or filters by default.
4. Preserve booking, auth, and portal state logic unless the bug is in that logic.
5. Run:

```bash
npm run build
```

6. Browser QA affected routes on desktop and mobile.
7. Update `PLANS.md` and `.agents/fixes-log.md` when the change fixes a bug.

## Medical Certificate Booking Pass

Use when changing `/doctor`, landing aliases, pricing, checkout, or certificate add-ons.

- Keep copy conservative: request, review, and clinically appropriate issue.
- Keep duration capped and pricing consistent in UI and API.
- Update Stripe-facing pricing code and public copy together.
- Check carer certificate add-on flow separately from standalone certificate flow.
- Required carer add-on details: carer name, date of birth, relationship/caring context, and certificate dates.
- Require patient DOB and phone in both browser and server validation. Self-service certificate
  requests require age 16 or older, and certificate start dates must be today or later.
- Keep DOB in protected clinical records for identity and eligibility checks, but do not print it
  on the issued certificate PDF.
- Do not imply a certificate is issued before payment and clinician review are complete.

## Patient Auth And Portal Pass

Use when changing patient login, magic link, password reset, account creation, profile, messaging, or portal session behavior.

- Read `AGENTS.md`, `PLANS.md`, `backend/README.md`, and the touched patient portal/API files.
- Keep patient identity sourced from API payloads, not hardcoded UI values.
- Reset and magic-link flows must return patient-safe generic success messages where account existence is sensitive.
- `/api/patient/account-exists` must fail with controlled non-500 responses.
- Message send success must keep the patient in the portal unless the session is actually invalid.
- Browser QA `/patient-login`, `/patient/reset-password`, and `/patient`.

## Doctor Portal Pass

Use when changing practitioner account creation, login, password reset, queue, review, profile, or approval.

- Public doctor signup must not grant active practitioner access without admin approval.
- Password reset must create a valid reset token and send through the configured email transport or mock outbox.
- Doctor profile must support AHPRA/provider metadata and allow provider-number updates.
- Administrator certificate corrections and reissues must be audited. Do not allow draft edits to
  change patient account ownership, payment state, risk evidence, verification codes, or clinician credentials.
- QA the static pages under `frontend/public/doctor` plus API routes.

## SEO And Crawlability Pass

Use when changing public content, metadata, robots, sitemap, or static crawl support.

- Ensure public pages have unique titles, descriptions, canonical URLs, and crawlable H1/H2 text.
- Keep important page links in the header, footer, or crawlable page body.
- Update `frontend/public/robots.txt` and `frontend/public/sitemap.xml` or run `npm run sitemap:generate` when routes change.
- If key content is client-rendered only, add static fallback text in the HTML shell or generated artifacts where feasible.

## Backend/API Pass

Use when changing `api/index.js`, `backend/server.js`, storage, email, Stripe, Supabase, auth, or PDF generation.

- Preserve existing route contracts unless frontend callers are updated.
- Return controlled JSON errors instead of raw `fetch failed` or unhandled 500s.
- Keep secret values out of logs and docs.
- Add or update Supabase migrations for DB fields.
- Smoke check affected endpoints locally when environment variables allow.

## Documentation Pass

Use after meaningful changes.

- `AGENTS.md`: commands, architecture, validation policy.
- `PLANS.md`: current objective, status, file map, decisions.
- `DESIGN.md`: design tokens, layout, copy, asset rules.
- `SKILLS.md`: repeatable workflows only.
- `.agents/fixes-log.md`: required for bug/regression fixes.
