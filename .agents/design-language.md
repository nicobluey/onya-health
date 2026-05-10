# Onya Health Design Language

## Core palette (source of truth)
Use the global tokens in `frontend/src/index.css`.

- `#0A1931` - deep navy (primary text, strongest emphasis)
- `#1A3D63` - primary brand blue (primary actions, active navigation)
- `#4A7FA7` - secondary blue (links, secondary actions, accents)
- `#B3CFE5` - soft light blue (borders, dividers, muted surfaces)
- `#F6FAFD` - page background / calm surface background
- `#FFFFFF` - elevated content surfaces (cards/forms where needed)

## Usage rules
1. All pages must use this same palette consistently across desktop and mobile.
2. Use semantic tokens/classes from `index.css` and Tailwind theme tokens first; avoid one-off hex values.
3. Do not introduce purple, neon/bright blue, or unrelated accent palettes.
4. Keep UI calm, clinical, and trustworthy: soft borders, restrained shadows, clear hierarchy.
5. Keep typography on Inter across the product.

## Semantic status colors
Non-brand colors are only allowed for semantic state communication:

- success/live: `#ECFDF3` / `#86EFAC` / `#166534` (or token `--color-success`)
- warning: `#FFF8E8` / `#F3DF9D` / `#8A6700`
- error/denied: `#FFE9E8` / `#F3C5C4` / `#A93736`

## QA checklist before merge
- Verify major routes on desktop and mobile.
- Confirm readable contrast for default/hover/focus/disabled states.
- Search for hardcoded colors and remove conflicts with this palette.
