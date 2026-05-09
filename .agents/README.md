# .agents Notes

This folder tracks production incidents, regressions, and applied fixes so future deploys keep behavior stable.

## Agent references

- `FE_AGENT.md`: frontend implementation contract and regression checks.
- `BE_AGENT.md`: backend/data-model contract, migration references, and API expectations.

## Process (mandatory)

1. Add an entry to `fixes-log.md` before deploying when a bug/regression is fixed.
2. Include:
   - user-visible symptom
   - root cause
   - exact files/areas changed
   - verification steps
3. If a fix includes data or migration work, record the SQL/script used and result summary.

## Current focus

- Keep meal-plan generation backward-compatible with historical cached data.
- Avoid strict media-format assumptions that hide valid legacy recipe images.
