# Projection implementation ledger

Base: `088c0a7`. Branch: `feat/configurable-trend-projection`.

User explicitly requested implementation with subagents. Current clean checkout
uses a separate feature branch; PR #11 remains independently reviewable.
Baseline: 85 Vitest files / 712 tests passed before implementation.

| Boundary | Contract checked | Result |
| --- | --- | --- |
| Calculator / snapshot | Pure typed target and linear result | Consistent; overflow before horizon |
| Profile / snapshot | Raw numeric profile to centered fitted coefficients | Consistent; missing terms unavailable |
| Snapshot / editor-export | Explicit response, source result and identity | Same snapshot feeds display and export |
| Editor / store | Session applied settings, local drafts and dirty reporting | Agents coordinate exported action names |
| Series / table-overlay | Explicit selected index and key | Must invalidate replacement at same index |
| Task 1 | Tests match strict crossing and equality behavior | No contradiction |
| Task 2 | Fixed-effect profile, not random patient predictions | No contradiction |
| Task 3 | Generalization includes actual Sidebar/View gates | Reviewed plan amendment included |
| Task 4 | Browser export plus actual engine acceptance | Distinct mock-worker and real-engine checks |

Ruling: run independent core, UI/export and selection/state ownership in parallel
— user requested subagents, interfaces are specified — integration may require
small follow-up adjustments; parent owns browser/runtime checks and review.

- [x] Core calculator/profile/snapshot/presets, focused tests and review.
- [x] Projection editor/table/export, focused tests and review.
- [x] Generic selection/session state/overlay, focused tests and review.
- [x] Full tests/build/browser and real-engine verification.
- [x] Final independent review, changelog, commit and draft PR.

Review: core calculator/profile/snapshot independently approved. Whole-branch
review found a nonrenal formula-summary label; fixed with a red/green regression
and rereviewed. Browser visual inspection found inherited alignment/width issues;
scoped styles and a viewport-bound regression correct them.

Verification: 757 unit/integration tests passed, production build passed, 13
Chromium tests passed against the built application. Actual lme4 and nlme profile
projections recover known coefficients and crossing times for two outcomes.
