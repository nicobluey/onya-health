---
name: onya-health-coding-guardrails
description: Behavioral guardrails for writing, reviewing, and refactoring Onya Health code.
version: 1.0.0
---

# SKILL.md - Onya Health Coding Guardrails

Use these rules before writing or refactoring code in this repository.

## 1. Think Before Coding

State assumptions when the request is broad. If patient safety, billing, authentication, or compliance could be affected, identify the risk before changing code.

For ambiguous implementation details, prefer the existing local pattern over a new abstraction.

## 2. Simplicity First

Make the minimum change that fixes the user-visible problem.

- No speculative features.
- No framework swaps.
- No new global state layer.
- No new API shape unless both frontend and backend require it.
- No generalized abstractions for a one-off flow.

## 3. Surgical Changes

Every changed line should trace to the request, the bug report, or a necessary validation fix.

- Match existing style.
- Preserve current form state, validation, and submit handlers unless the bug is in that logic.
- Remove only unused code introduced by your own change.
- Do not revert user changes or unrelated dirty work.

## 4. Clinical And Compliance Caution

For medical certificates:

- Do not imply instant issue, guaranteed approval, or automatic outcome.
- Keep clinician review and clinical appropriateness visible.
- Keep certificate duration and pricing enforced server-side as well as in the UI.

For nutrition and meal plans:

- Enforce calorie and macro guardrails with deterministic code, not model prose.
- Avoid extreme targets without explicit clinical-review framing.
- Keep serving counts, ingredients, and recipe steps internally consistent.

For auth and accounts:

- Do not expose whether an email exists in patient-facing reset flows.
- Do not grant practitioner access from public signup without admin approval.
- Keep token rotation and session persistence explicit.

## 5. Verify With Concrete Checks

For each fix, define what proves it works:

- Build/type check for frontend changes.
- API smoke checks for route behavior.
- Browser checks for visible copy, layout, and portal behavior.
- Regression test or deterministic helper check for pricing, meal plans, and auth helpers when practical.

Record bug fixes in `.agents/fixes-log.md` before closing the task.
