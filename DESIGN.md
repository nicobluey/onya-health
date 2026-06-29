---
name: onya-health-design
description: Design system, copy rules, asset guidance, and interaction standards for Onya Health.
version: 1.0.0
---

# DESIGN.md - Onya Health Design System

This file tracks the Onya Health visual and copy system. The product should feel calm, modern, clinically trustworthy, and easy to use under mild stress.

## Design Intent

Onya should feel:

- clear and reassuring;
- premium without looking decorative;
- consumer-friendly rather than hospital-admin heavy;
- medically responsible about review, privacy, and outcomes;
- efficient for repeated portal and practitioner workflows.

It should not feel:

- like an instant-certificate vending machine;
- like a generic AI SaaS landing page;
- like a loud wellness marketplace;
- like a clinical system with dense, intimidating forms.

## Source Of Truth

Use global tokens and utilities in `frontend/src/index.css`. Keep legacy stubs `DESIGN_STYLE.md` and `DESIGN_SYSTEM.md` pointing to the current docs.

Preferred brand assets live in `frontend/public`, including:

- `HERO.webp`
- `Green Cells.webp`
- `Blue Cells.webp`
- `Pipette.webp`
- `Medical Certificate Landing.webp`
- `landing-work-certificate.webp`
- `landing-university-certificate.webp`
- `landing-carers-certificate.webp`
- `felicity-profile.webp`
- `meal-fallbacks/*`

Use raw imagery by default. Do not apply photo tints, gradient washes, haze layers, opacity fades, duotone effects, or blur overlays unless the user explicitly asks.

## Typography

- Headings: `"Basic Commercial Pro", Arial, sans-serif` where available.
- Body copy: `Inter, system-ui, sans-serif`.
- No decorative display fonts.
- No negative letter spacing.
- Do not scale font size directly with viewport width.

Use plain-language healthcare copy. Avoid technical AI jargon unless the page is specifically about AI support.

## Color Tokens

Current public-site and app palette:

- Deep navy: `#0A1931`
- Primary brand blue: `#1A3D63`
- Secondary blue: `#4A7FA7`
- Soft light blue: `#B3CFE5`
- Calm background: `#F6FAFD`
- White: `#FFFFFF`

Marketing sky-blue system:

- Primary: `#2E8CFF`
- Hover: `#1F7BE6`
- Supporting: `#58A8FF`
- Surface tints: `#F1F8FF`, `#EAF4FF`, `#DBEEFF`

Clinical green system for auth/portal where appropriate:

- Primary: `#1F5F3F`
- Supporting: `#88A18D`
- Surface tints: `#EFF4EF`, `#EDF1EC`, `#F8FAF7`
- Border tints: `#DBE2D9`, `#B9C8BA`

Semantic colors only for state:

- Success/live: green family.
- Warning/pending: muted yellow family.
- Error/denied: red family.

Avoid purple, neon blue, beige-dominant, and unrelated accent palettes.

## Layout Rules

- Center content with stable max-width containers.
- Use full-width sections, not floating page-section cards.
- Use cards for repeated items, forms, modals, dashboards, and genuine framed tools.
- Do not put cards inside cards.
- Keep sibling cards at matched heights where they represent peer choices.
- Inputs and buttons should use stable dimensions so hover/focus text does not shift layout.
- Mobile layouts must be intentional, with no clipped text or horizontal overflow.
- Keep one primary action per section.

## Page Structure

### Homepage

1. Clear first-viewport signal: Onya Health and online care/certificate request path.
2. Primary CTA into the appropriate consult flow.
3. Service cards and trust/process proof.
4. Plain-language explanation of review and suitability.
5. Footer links to policy, trust, contact, and key landing pages.

### Medical Certificate Landing Pages

1. Conservative H1 such as `Request a medical certificate online`.
2. Supporting copy that states clinician review and clinical appropriateness.
3. CTA to start the consult request, not to claim instant approval.
4. Pricing displayed exactly and consistently.
5. FAQ with clear boundaries: not every request is approved, emergencies are excluded, and certificates are issued only when appropriate.

### Booking Flow

1. Service choice and reason.
2. Patient details and account-status check.
3. Certificate dates/duration with server-side cap.
4. Add-ons, including carer's certificate details when selected.
5. Payment/checkout.
6. Patient account and portal handoff.

### Patient Auth And Portal

Keep auth and portal screens calmer than marketing pages:

- clinical green accent family when useful;
- clear error states;
- visible focus;
- no visual clutter around health details;
- no hardcoded patient or dietitian identity.

### Doctor Portal

Practitioner screens should be dense, readable, and action-focused:

- queue status;
- request risk summary;
- patient-entered context;
- approve/deny/more-info actions;
- doctor profile and credential metadata;
- admin approval status for accounts.

### Weight-Loss Reset

Meal-plan UI must make serving count, calories, macros, ingredient lists, and recipe steps easy to inspect. Plans should include safety guardrails and dietitian-review framing where needed.

## Motion And Interaction

Allowed:

- subtle opacity/translate reveals;
- small hover and focus transitions;
- clear step transitions in booking;
- progress states that reflect real work.

Avoid:

- over-animated medical workflows;
- decorative cursor effects;
- bounce/elastic motion;
- animated content that blocks reading or form completion.

All controls must remain keyboard-navigable with visible focus states.

## Copy Rules

Use:

- `Request`
- `Submit for review`
- `Clinician-reviewed`
- `Issued where clinically appropriate`
- `Secure patient portal`
- `Clear next steps`

Avoid:

- `Instant certificate`
- `Guaranteed approval`
- `Approved in minutes` unless clinically and operationally reviewed
- `AI doctor`
- `Automatic certificate`
- `No questions asked`

Nutrition copy must avoid promising safe weight loss for every user. Extreme calorie targets must be blocked or framed for practitioner review.

## SEO And Crawlability

Important public pages need:

- crawlable H1/H2/body text;
- unique title and meta description;
- canonical URL;
- internal links from header, footer, or body;
- inclusion in `frontend/public/sitemap.xml`;
- no accidental `noindex` or robots block.

For a client-rendered Vite app, keep critical route copy available through metadata/static artifacts where possible and validate rendered crawlability after major public-page changes.

## Asset Replacement Rule

When adding or replacing assets:

1. Put final web assets under `frontend/public`.
2. Prefer `.webp` for large raster imagery.
3. Reference assets directly by public path.
4. Preserve raw appearance unless an explicit treatment is requested.
5. Re-run build and browser QA affected pages.
