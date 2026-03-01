# Onya Health Design System (v2)

## Core Principles
- Trust-first: clear hierarchy, readable copy, and calm contrast.
- Minimal palette: sky blue actions, black/charcoal typography, white surfaces.
- Mobile-first responsive layout with desktop scale-up.
- Accessible interactions with keyboard focus, visible states, and semantic labels.

## Typography

### Font Families
- Display / Headlines: `"Basic Commercial Pro", Arial, sans-serif`
- Body / UI / Form Text: `'Inter', system-ui, sans-serif`

### Font Rules
- Headings (`h1-h6`) use Basic Commercial Pro.
- Body, helper text, and controls use Inter.
- Avoid serif fallback stacks other than the approved heading fallback.

## Color System

### Brand / Action Colors
- `--color-primary` / `--color-forest-700`: `#2e8cff`
- `--color-primary-hover` / `--color-forest-800`: `#1f7be6`
- `--color-forest-900`: `#165fad`

### Text Colors
- `--color-text-primary` / `--color-bark-900`: `#020617`
- `--color-text-secondary` / `--color-bark-600`: `#334155`
- `--color-bark-500`: `#475569`

### Neutral / Surface Colors
- `--color-sand-25`: `#ffffff`
- `--color-sand-50`: `#ffffff`
- `--color-sand-75`: `#f8fafc`
- `--color-sand-100`: `#f1f5f9`
- `--color-sand-150`: `#e2e8f0`
- `--color-sand-200`: `#cbd5e1`
- `--color-sand-300`: `#94a3b8`
- `--color-sand-400`: `#64748b`

### Bark Scale
- `--color-bark-25`: `#f8fafc`
- `--color-bark-50`: `#f1f5f9`
- `--color-bark-100`: `#e2e8f0`
- `--color-bark-200`: `#cbd5e1`
- `--color-bark-300`: `#94a3b8`
- `--color-bark-400`: `#64748b`
- `--color-bark-500`: `#475569`
- `--color-bark-600`: `#334155`
- `--color-bark-700`: `#1e293b`
- `--color-bark-800`: `#0f172a`
- `--color-bark-900`: `#020617`

### Sunlight / Accent Tints
- `--color-sunlight-50`: `#f8fbff`
- `--color-sunlight-100`: `#f1f8ff`
- `--color-sunlight-200`: `#dbeeff`
- `--color-sunlight-300`: `#b7dcff`
- `--color-sunlight-400`: `#4aa3ff`

### Feedback / Status
- Pending / Warning (text): `#d97706` (amber)
- Border default: `--color-border` / `#cbd5e1`

## Layout & Spacing
- Section max width: `max-w-7xl` (feature blocks), `max-w-5xl` to `max-w-6xl` (focused content).
- Desktop gutters: `px-8`.
- Mobile gutters: `px-4` to `px-6`.
- Section rhythm: `py-12` to `py-24`.
- Large surfaces: rounded containers (`rounded-3xl` to `rounded-[2.5rem]`).

## Component Patterns

### Buttons
- Primary: sky blue fill + white text.
- Secondary: white background + neutral border.
- Radius: `rounded-xl` by default.

### Form Controls
- Inputs and selects target `h-12` baseline.
- Use blue focus ring and contrast-preserving text.
- Validation and helper states remain inline and concise.

### Status Messaging
- Pending verification labels use amber (`text-amber-600`/`text-amber-700`).
- Error labels use red (`text-red-500`).

### Logos / Trust Rail
- Keep logos in original brand colors.
- Maintain equal visual height for mixed logos.
- Auto-scroll should remain smooth and uninterrupted.

## Motion
- Keep transitions functional and subtle (`160ms-240ms` for UI states).
- Scroll storytelling can use sticky sections and stacked cards.
- Avoid excessive rotation or playful motion in clinical flows.

## Landing Composition (Service Pages)
1. Hero
2. Used by patients
3. How it works (stacked scroll cards)
4. Social proof
5. Blogs
6. What makes Onya Health leading
7. When to use telehealth
8. Start consultation CTA
9. Ready to skip waiting room CTA
10. FAQ
11. Rounded footer

## Accessibility
- Keyboard focus visible for all interactive elements.
- Proper semantic labels/roles for buttons, links, and custom controls.
- Maintain strong color contrast over image backgrounds.
