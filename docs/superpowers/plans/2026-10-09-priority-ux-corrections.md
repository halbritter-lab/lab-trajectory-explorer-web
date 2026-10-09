# Priority UX Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Use superpowers:subagent-driven-development only if the owner chooses that execution method. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make model-fitting availability understandable, make patient navigation practical on touch devices, and prepare the outstanding research/user acceptance.

**Architecture:** Keep the current workspace and numerical contracts. Derive fitting availability from the existing model validator and use that decision for the studio action, preview action and handler. Improve the existing patient buttons without changing table navigation or selection semantics.

**Tech Stack:** React 18, TypeScript, Zustand, Vitest, Testing Library, Playwright, pnpm.

**Spec:** Owner's scope decision of 2026-10-09, recorded below; existing contracts in `docs/workspace-real-data.md`, `docs/research-acceptance.md`, and `docs/method-algorithms.md`.

## Approved planning scope

The owner requested a plan for the most important corrections following the repository review at `e622f1b`. Domain decoupling is deferred and is to be documented in English on GitHub. An exportable package is not planned.

Immediate corrections:

- An enabled Fit model action must have at least one eligible model to execute; otherwise an adjacent explanation must state why fitting is unavailable.
- Buttons that open a patient in the trajectory table must have a target at least 44 by 44 CSS pixels, including on a 390-pixel viewport.
- Research-data and first-user acceptance remain a separate, explicit gate.

Deferred work includes the unused `AnalysisModule.appliesTo` contract, kidney-specific endpoint input filtering, domain-level enable/remove controls, preset/settings/UI decoupling, and host-level registry injection. Record these together as deferred architecture work, without implementing them in this package. OD-11, OD-21, OD-22 and OD-29 retain their existing after-0.3.0 disposition. Hidden-page performance work remains conditional on representative data measurements.

## Global constraints

- Application copy, accessibility labels, generated export labels and new user documentation are English. Preserve imported names, values and units verbatim.
- Do not change formulas, model eligibility floors, preparation rules, endpoint policies or golden outputs to fix these UX defects.
- Continue using `validateMixedModelRows(rows, config)` as the authority: ten qualifying patients, three distinct measurement times for random slopes or two for random intercepts. Do not duplicate these thresholds in UI code.
- Research data, patient identifiers and screenshots containing patient data must not be committed to this public repository.
- Review complete changes; passing CI does not establish research/user acceptance or authorize publication.
- No package build, public import API, dependency upgrade or domain restructuring in this plan.

## Review focus

- An entity with ten patients can still fail repeated-time or factor/reference validation; button availability must use the full validator (Task 1).
- A grouped request can contain both eligible and ineligible units; fit the eligible units and make the skipped scope visible (Task 1).
- Switching outcome, factors or random effects must immediately update the studio action and any visible preview action. A current successful preview continues to hide its duplicate action; invalidated results reveal the appropriately gated action (Task 1).
- Long imported patient IDs must remain fully accessible when their visual labels are truncated (Task 2).
- Larger targets must retain horizontal table scrolling, keyboard focus restoration and selection across pages (Task 2).

---

## Task 1: Explain and consistently gate model fitting

**Files:**

- Modify: `src/workspace/CohortModelsWorkspace.tsx`
- Modify: `src/workspace/CohortModelPlotPreview.tsx`
- Test: `tests/workspace/cohort-models.test.tsx`
- Test: `tests/e2e/workspace.e2e.ts`
- Update: `docs/workspace-real-data.md`, `CHANGELOG.md`

**Interfaces:**

- Consume `entities: CohortModelEntityRows[]`, `mixedModelConfig: MixedModelConfig`, and `validateMixedModelRows(rows, config): MixedModelValidationResult`.
- In the workspace, memoize one validation result per entity; derive the eligible entities and the reasons for ineligible entities from that result.
- Extend preview props with `canFit: boolean` and `fitUnavailableReason: string | null`; retain `onFit?: () => void` and `isFitting?: boolean`.
- The studio and preview share the same eligibility decision. Keep the results table's existing validation and selection behavior; it already uses the same validator.
- Preserve the preview's existing `hasFits` visibility rule: a current fitted reference line hides the duplicate preview action. When no current fitted line exists, pass `handleFitAll` even under Trajectories No fit, so the preview displays a disabled action with its explanation. A missing spec continues to omit the preview entirely.

- [x] Add failing component cases: five modeled patients means both visible Fit model actions are disabled; validator text is visible adjacent to the actions; no store fitting action is called. The existing tests mock the results table, so these cases must verify the studio/preview rather than rely on table text.
- [x] Add cases for zero rows, enough patients with insufficient distinct times, absent categorical reference, and a valid ten-patient dataset. Assert immediate action-state changes after changing model settings/outcome. Add explicit cases for a current converged, non-singular result (preview action hidden), its invalidation after switching to an ineligible outcome/configuration (preview action revealed and disabled), and Trajectories No fit (both actions disabled with the no-fit explanation).
- [x] Add a grouped fixture with ten qualifying patients in group A and five in group B, each with three distinct retained measurement times and no missing required factors. Production preparation adds the pooled cohort as well as both groups: assert the eligible pooled cohort and group A are submitted (two entities), group B is skipped (one entity), the primary action states the eligible count, and an adjacent note states the skipped count. Add an all-invalid grouped fixture; assert no fit is submitted and reasons identify the affected units.
- [x] Run `pnpm exec vitest run tests/workspace/cohort-models.test.tsx`; verify that the new availability/feedback assertions fail before implementation.
- [x] Derive `canFit` from a nonempty eligible-entity list and absence of running/no-fit states. Use that list in `handleFitAll`; revalidate at invocation to guard against a stale action. If invocation finds no eligible unit, display the reason instead of silently returning. Do not start a worker.
- [x] Use adjacent English guidance: `No model can be fitted with the current data and settings.` followed by the existing validator message(s). Give the feedback a stable ID and associate both disabled actions through `aria-describedby`; announce changes with a polite status. For no-fit settings, explain that fitting is disabled under Trajectories. While running, retain progress feedback.
- [x] Apply the same availability and explanation to the preview button using the visibility rule above. Replace both the unconditional `Run model to estimate slope` paragraph fragment and `Click 'Fit model' to calculate trajectory` SVG hint when fitting is unavailable; show progress guidance while running. Preserve result identity/convergence guards and numerical curves.
- [x] Add a browser regression: load the bundled demo, open Cohort models, verify the default eGFR sample has five complete-case patients, verify both fit buttons are disabled and the ten-patient explanation is visible. Switch to an eligible synthetic fixture and verify actions become available. Use existing mocked-worker coverage for job submission; this regression need not download WebR.
- [x] Run `pnpm exec vitest run tests/workspace/cohort-models.test.tsx tests/workspace/model-validity.test.tsx`, then `pnpm exec playwright test tests/e2e/workspace.e2e.ts --project=chromium --grep "model fitting availability"`.
- [x] Document the new availability behavior and add an Unreleased changelog entry. Review the diff and commit the verified package as `fix: explain unavailable cohort model fits`.

## Task 2: Enlarge patient navigation targets

**Files:**

- Modify: `src/workspace/trajectories-workspace.css`
- Modify only if needed for layout: `src/workspace/TrajectoriesWorkspace.tsx`
- Test: `tests/e2e/workspace.e2e.ts`
- Update: `CHANGELOG.md`

**Interfaces:**

- Preserve `button[aria-label="Open patient <id>"]`, the complete accessible name/title, existing `open(id)` behavior, and originating-button refs.
- Retain the two sticky leading table columns and existing horizontal scrolling.

- [x] Add one browser regression using synthetic short and long patient IDs. At widths 1440 and 390, assert each patient-opening button's bounding box is at least 44 by 44 CSS pixels. Verify the page itself does not overflow; parameter columns may still scroll inside the table region.
- [x] Run `pnpm exec playwright test tests/e2e/workspace.e2e.ts --project=chromium --grep "patient navigation targets"`; verify the size assertion fails on the current 21-pixel-high buttons.
- [x] Give `.wt-table tbody th button` a minimum width and height of 44px with `box-sizing: border-box`; center its label and retain truncation for long IDs. Apply this at desktop and narrow widths. Keep the existing sticky widths unless the measured layout requires a minimal adjustment.
- [x] Keep desktop keyboard/focus assertions in the existing Chromium context. Put the touch case in a separate `test.describe('patient navigation targets on touch', ...)` with `test.use({ hasTouch: true, viewport: { width: 390, height: 844 } })`; use the patient button's `tap()` to open the long-ID patient, then tap the in-app Back action. Verify full IDs remain in the accessible name/title, focus returns to the originating button, and checkbox selection and pagination still operate independently. A resized desktop context alone does not establish touch behavior.
- [x] Run the new browser regression and the existing `2000-patient table navigation` and `back navigation` cases. Inspect desktop/mobile captures once; fix any observed layout defect and confirm once.
- [x] Add the Unreleased changelog entry, review the diff, and commit as `fix: enlarge trajectory patient navigation targets`.

## Task 3: Verify the package and conduct acceptance

**Files:**

- Update: `docs/research-acceptance.md`
- Update: `docs/workspace-completion-backlog.md`
- Update only for performed checks: `tests/e2e/smoke.md`

**Interfaces:**

- Consume the completed corrections from Tasks 1 and 2 and the existing research-acceptance checklist.
- Produce a dated technical verification record, and separately an anonymous research/user acceptance record when representative inputs and a human tester are available.

- [x] Run `pnpm test` and `pnpm build` at `76ba5e5`: 888 tests in 93 files passed; production build passed. Record dated actual results, not historical counts.
- [x] Finish production Chromium verification with `CI=true pnpm test:e2e --workers=2`: initial run at `76ba5e5` had 33 passes/one fixture failure; corrected fixture at `361a002` passed 34/34 (exit 0, 31.8 seconds). Source/unit tests were unchanged after the unit/build checkpoint.
- [x] Review the whole diff for scope and numerical-output changes: independent final review of `e622f1b..1a0783e` confirmed no numerical/core/worker/preparation/validator-policy/endpoint/golden/dependency/package changes.
- [x] Perform and record final independent code review (2026-10-09): APPROVE for `e622f1b..1a0783e`, no Critical or Important findings. Retain the nonblocking Minor direct invocation-time rejection regression suggestion; handler revalidation and normal UI/configuration transition coverage were confirmed.
- [x] Assess real-WebR smoke need: no numerical worker change was identified; actual WebR smoke was not rerun for these CSS/button availability changes. Browser model UI checks use synthetic/mock-worker coverage.
- [x] Ask the owner for representative workbooks, research questions and a first-time tester when acceptance is ready (asked asynchronously; owner confirmed on 2026-10-09 that research files/tester are not yet available and acceptance must remain open). Keep research files outside the public repository. The current synthetic fixtures are sufficient for technical checks, not for this acceptance.
- [ ] Run the existing checklist across import, demographics, derivation, trajectories, endpoints, cohort models, exports and local resumption. Specifically check disabled fitting explanations and patient navigation on a touch device.
- [ ] Record cohort dimensions and perceived/observed latency during demographic and derivation edits. Only schedule hidden-page computation changes if these measurements identify a practical problem; keep that work tracked in issue #2.
- [x] Complete and record technical verification separately from research/user acceptance; final code and documentation reviews approved the scoped technical package.
- [ ] Record anonymous research/user results, unresolved findings and the tester's decision when representative inputs and a human tester are available. Research/user acceptance remains open.
- [x] Update and commit technical documentation only for performed checks as `docs: record priority UX verification`.
- [x] Controller updated issue #2's two UX checklist items and dated local verification/review record after checks passed. Research/user acceptance remains unchecked, and deferred architecture work remains in #23. No merge or publication occurred.
- [ ] Commit research/user acceptance evidence separately when available.

## Completion and handoff

Tasks 1 and 2 are independently reviewable implementation packages. Task 3 has a technical portion that can run immediately afterwards and a human/data-dependent acceptance portion. Do not call the full product accepted until that latter portion is completed.

The original planning turn created the plan and GitHub tracking only. Implementation and technical verification are now recorded above; version preparation and publication remain separate steps requiring release acceptance.

## Independent plan review (2026-10-09)

An independent reviewer checked this plan against the current workspace, model preparation, preview visibility, test configuration and `CLAUDE.md`. The scope and numerical constraints were confirmed. Review corrections incorporated before handoff: account for the pooled entity in grouped fixtures, specify fitted/no-fit preview transitions and both guidance locations, use a touch-enabled test context with `tap()`, and require a recorded final implementation code review. This is a review of the plan, not verification of an implemented correction.
