---
name: onya-health-design
description: Nike-inspired, blue-biased design system for Onya Health public, auth, and portal screens.
version: 2.0.0
source_reference: nike/DESIGN.md
---

# DESIGN.md - Onya Health Design System

Onya now uses the Nike reference imported with `npx getdesign@latest add nike` as a spacing and typography model, not as a literal black retail clone. The system should feel direct, editorial, high-converting, and clinically credible.

## Design Intent

Onya should feel:

- decisive and premium;
- fast to scan on mobile;
- editorial and image-led on landing pages;
- clinically responsible about doctor review and outcomes;
- stripped back, with no decorative SaaS clutter.

It should not feel:

- vibe-coded, glassy, or over-rounded;
- like a generic AI landing page;
- like a wellness marketplace;
- like a guaranteed certificate vending machine.

## Nike Reference Translation

Use these principles from `nike/DESIGN.md`:

- Big display typography with tight line-height.
- Strong image-first hero sections.
- Pill CTAs and pill chips.
- Tight 8px spacing grid.
- Minimal chrome: white, off-white, ink, blue, and hairline borders.
- Cards should feel like product tiles, not floating SaaS panels.

Adaptations for Onya:

- Primary action color is blue, not black.
- Clinical copy remains conservative.
- Raw approved imagery stays unfiltered.
- Status colors are semantic only.

## Typography

- Display and headings: `"Basic Commercial Pro", "Helvetica Neue", Arial, sans-serif`.
- Body: `Inter, system-ui, sans-serif`.
- Display lockups use uppercase where it increases landing-page clarity.
- Letter spacing is `0`. Do not use positive or negative tracking utilities.
- Hero H1s should use line-height `0.9-1.0`; compact panel headings use normal scale.

Recommended scale:

- Campaign display: `clamp(48px, 8vw, 112px)`, weight `800`, line-height `0.9`.
- Landing section H2: `40-64px`, weight `800`, line-height `0.95`.
- Portal/page H1: `32-48px`, weight `800`, line-height `1.0`.
- Body: `16px`, line-height `1.5`.
- Caption: `12-14px`, weight `700`.

## Color Tokens

Use global tokens from `frontend/src/index.css`.

- Ink: `#06142B`
- Primary blue: `#1151FF`
- Hover blue: `#0034E3`
- Deep navy: `#0A1931`
- Blue surface: `#F3F8FF`
- Soft cloud: `#F5F7FA`
- Hairline: `#D7E2EE`
- Hairline soft: `#E7EEF6`
- White: `#FFFFFF`

Semantic colors only:

- Success: `#007D48`
- Warning: `#8A6700`
- Error: `#A93736`

Avoid purple, beige-dominant palettes, gradient orbs, bokeh, glassmorphism, and decorative color blobs.

## Layout Rules

- Use full-width bands and constrained inner content.
- Landing heroes must be image-led and give immediate category/offer clarity.
- Use an 8px spacing grid. Prefer `8, 16, 24, 32, 48, 64, 96`.
- Cards: square or 8px radius max unless a component is specifically a pill.
- Buttons/chips: full pill radius.
- Do not nest cards.
- Use one primary CTA per section.
- Mobile must show the next section hint in the first viewport for landing pages.

## Components

### Buttons

- Primary: blue pill, white text, `48px` high.
- Secondary: soft-cloud pill, ink text.
- Outline: white pill, blue/ink border.
- Buttons use sentence case unless the surrounding display lockup is uppercase.

### Tiles

- Product/service tiles use raw imagery, no overlay by default.
- Tile content sits below imagery on white or soft-cloud.
- Keep tile heights stable across siblings.

### Forms

- Inputs are pill or 8px rounded rectangles, `44-48px` high.
- Labels are compact, uppercase allowed, letter spacing `0`.
- Errors use semantic red, not brand blue.

### Portal

- Portal is denser than marketing.
- Use blue clinical chrome, not green unless explicitly requested.
- Sidebars and panels should feel like structured product UI, not soft wellness cards.
- Patient record search filters stay visible, compact, and server-backed. Date and duration
  filters must use the same query for result counts and the selected patient's request list.
- Certificate conversations use one shared thread. Patient messages align opposite staff messages;
  doctor replies use deep navy and `Customer support` replies use a distinct accessible blue.
- Sender controls must name `Doctor` and `Customer support` explicitly. Support messages never use
  a clinician name, but the authenticated portal account remains available in the server audit log.
- Patient certificate actions always enter the shared intake form. Unlimited coverage changes the
  checkout outcome after submission; it must not create a request from a portal card tap.
- Queue milestone connectors stop at the edge of each milestone circle and sit behind the circles;
  completed segments use navy while upcoming segments use the hairline color.
- Active subscriptions without a Stripe portal identifier show a billing-support action rather
  than offering the patient another Unlimited plan.

### Certificate PDFs

- Keep certificates to one A4 page with patient identity, clinical statement, clinician details,
  verification, and footer clearly separated.
- Patient identity includes the patient's name and age at consultation. Date of birth remains in
  the protected patient and doctor records and must not be printed on the certificate.
- Clinician identity includes registration number and Medicare provider number.
- Uploaded signatures are private profile assets. Render the signature without stretching it and
  keep the clinician note beside it so neither element collides with the footer.
- Reissued certificates show their current issue date and revision while retaining the original
  consultation date and issuing clinician identity.

### Stripe Checkout

- Use Supadoc as the Checkout display name with a solid `#1151FF` summary background and
  `#0A1931` actions on the payment side.
- Use `favicon.png` for Stripe's icon slot and omit the wide logo slot so Checkout presents
  the compact icon-and-name treatment.
- Use `favicon.png` as the Stripe product image for certificate products.
- Product names, descriptions, billing intervals, and amounts must match the booking funnel.
- Checkout submit copy must state that payment submits a request for doctor review and that
  certificates are issued only where clinically appropriate.

## Page Requirements

### Homepage

1. Full-bleed image-led hero.
2. Huge campaign H1: direct category/offer, not vague promise.
3. Primary CTA to `/doctor#book`.
4. Secondary CTA only when it helps choose certificate type.
5. Product-tile style certificate options.
6. Proof and process without over-explaining.

### Medical Certificate Landing Pages

1. Use the same display/spacing rhythm as homepage.
2. State doctor review and clinical appropriateness clearly.
3. Show pricing consistently.
4. Keep certificate types as sharp tiles, not rounded SaaS cards.

### Auth And Portal

1. No decorative science floaters.
2. Clear login form and portal identity.
3. Dense, scannable panels with blue pills and hairline borders.
4. Account-only trial users must be able to log in and load the portal.

## Copy Rules

Use:

- `Request`
- `Start certificate request`
- `Doctor-reviewed`
- `Issued where clinically appropriate`
- `Secure patient portal`
- `Clear next steps`

Avoid:

- `Instant certificate`
- `Guaranteed approval`
- `AI doctor`
- `Automatic certificate`
- `No questions asked`

## Asset Rules

- Use assets from `frontend/public`.
- Prefer `.webp`.
- Use optimized PNG where an integration needs a compact square brand asset, including Stripe Checkout.
- Use raw imagery by default.
- No image tints, blur, opacity washes, haze, duotone, or decorative overlays unless explicitly requested.
- Photo text contrast should be achieved through composition and placement first.

## QA Checklist

- Run `npm run lint`.
- Run `npm run build`.
- Visual-check desktop and mobile for `/`, `/doctor`, certificate landing pages, `/patient-login`, and `/patient`.
- Confirm no horizontal overflow.
- Confirm production aliases point to the deployed build before closing production work.
