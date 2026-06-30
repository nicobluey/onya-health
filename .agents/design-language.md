# Onya Health Design Language

Canonical design guidance lives in `DESIGN.md`.

Use `nike/DESIGN.md` only as the imported reference. The active Onya translation is:

- Nike-style editorial scale and 8px spacing rhythm.
- Blue-biased Onya palette.
- Raw medical/certificate imagery.
- Pill CTAs and chips.
- Sharp product tiles and 8px panels.
- No glassmorphism, gradient-orb decoration, bokeh, or oversized nested SaaS cards.

Before UI edits, read:

1. `DESIGN.md`
2. `frontend/src/index.css`
3. The touched screen/component files

Primary QA:

- Desktop and mobile visual pass.
- No text clipping or horizontal overflow.
- No hardcoded off-brand accent colors except semantic states.
- `npm run lint`
- `npm run build`
