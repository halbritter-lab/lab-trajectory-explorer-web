# Configurable trend projection implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add configurable threshold projections for fitted model profiles, with renal presets and custom targets.

**Architecture:** Pure generic linear projection, explicit mixed-model adapter, reusable React editor and provenance-preserving export. Projection settings do not affect model fitting.

**Tech Stack:** TypeScript, React, Vitest, Playwright, existing webR and SheetJS.

**Spec:** `docs/superpowers/specs/2026-09-13-configurable-trend-projection-design.md`.

## Global constraints

- Keep numeric parity fixtures and legacy latest-measurement projections unchanged.
- Never silently convert units, drop model terms or reuse stale model results.
- Report conditional projections; no event-time model or fabricated time CI.
- Preserve PR #11 as the factor feature; execute production changes on a dependent feature branch or after its merge.
- Read `CLAUDE.md` and the spec before execution; review code before completion.

## Task 1: General projection contract and calculator

Create `src/core/projection/linearProjection.ts` and
`tests/core/projection/linearProjection.test.ts`.

```ts
interface ProjectionTarget {
  id: string; label: string; outcome: string; unit: string
  threshold: number; direction: 'below' | 'above'
}
interface LinearProjectionInput {
  intercept: number; slopePerYear: number; outcome: string; unit: string
  referenceTimeYears: number; horizonYears: number; target: ProjectionTarget
}
type ProjectionStatus = 'crossing' | 'already_met' | 'flat' | 'away'
  | 'beyond_horizon' | 'invalid' | 'incompatible_target'
interface LinearProjectionResult {
  status: ProjectionStatus
  modelTimeYears: number | null; remainingYears: number | null
}
// Export these types and projectLinearThreshold(input): LinearProjectionResult.
```

- [ ] Write red tests, including `expect(projectLinearThreshold({intercept:60,slopePerYear:-3,outcome:'eGFR',unit:'u',referenceTimeYears:2,horizonYears:20,target:{id:'custom',label:'Study target',outcome:'eGFR',unit:'u',threshold:30,direction:'below'}})).toEqual({status:'crossing',modelTimeYears:10,remainingYears:8})`.
- [ ] Add the acceptance examples and all boundary cases in the spec; verify failure with `pnpm exec vitest run tests/core/projection/linearProjection.test.ts`.
- [ ] Implement input validation, strict-side checks, equality handling, `(threshold-intercept)/slopePerYear`, horizon filtering and finite-result checks in that order. Failed states have null time fields.
- [ ] Rerun the focused test and commit the independently tested calculator.

## Task 2: Fitted mixed-model profile adapter

Create `src/core/mixedModel/projectionProfile.ts` and
`tests/core/mixedModel/projectionProfile.test.ts`; consume existing `MixedModelSuccess`,
`mixedModelFactors` and `mixedModelFactorColumn`.

```ts
type ProjectionProfile = Record<string, string | number>
type ProfileLine = {status:'ready';intercept:number;slopePerYear:number}
  | {status:'unavailable';reason:string}
// resolveProjectionProfile(result: MixedModelSuccess,
//   profile: ProjectionProfile): ProfileLine
```

- [ ] Test numeric raw-to-centered conversion, nonreference categorical effects and all level/slope combinations against manually calculated a and b. Include category labels containing colons and generated-column-like text.
- [ ] Test missing required centers/terms, invalid numeric values, unknown categories and failed/nonconverged fits at their caller boundary. Do not accept nonfinite coefficients.
- [ ] Construct exact coefficient names from generated columns and selected category data. Sum main effects into a and time interactions into b. References legitimately contribute zero; an absent nonreference coefficient fails.
- [ ] Preserve legacy age-adjusted fits using stored centering metadata. Run adapter, identity and configured-factor tests; commit.

## Task 3: Editor, presets and source-fit integration

Create `src/core/projection/targetPresets.ts`, `src/ui/cohort/ModelProjectionPanel.tsx`
and `tests/ui/ModelProjectionPanel.test.tsx`. Modify
`src/ui/cohort/CohortModelTable.tsx` to render the panel from stored successful,
identity-matched model results and pass the fitted category choices.

```ts
interface ProjectionSettings {
  targets: ProjectionTarget[]; profile: ProjectionProfile
  referenceTimeYears: number; horizonYears: number
}
// ModelProjectionPanel receives stored result + identity, outcome/unit,
// available fitted categories, controlled settings and onSettingsChange.
```

- [ ] Test adding/editing/removing custom targets, below/above direction, reference/horizon validation, reference-profile defaults and changed-profile recalculation without calling runJob.
- [ ] Add G4/G5 boundary preset definitions as data (30/15, below) bound to compatible eGFR outcome/unit. Test no automatic renal presets for unrelated series or incompatible units.
- [ ] Render a labeled table of statuses/times, fitted-curve anchor and explicit unavailable time uncertainty. Keep invalid draft settings visible without presenting a result as valid.
- [ ] Keep settings scoped by model entity/series; reuse existing identity matching for source data changes. Test stale fits and profile changes after refitting.
- [ ] Audit existing eGFR UI/runtime names: retain internal wire compatibility, display actual response identity and verify another numeric series reaches the adapter. Do not claim a generic UI while hiding it behind an eGFR-only gate.
- [ ] Run focused UI/core tests and commit.

## Task 4: Export and browser acceptance

Modify `src/core/mixedModel/modelExport.ts`, `src/ui/cohort/CohortModelTable.tsx`
and their tests; add `tests/e2e/model-projections.e2e.ts`.

- [ ] Extend export input with optional projection settings and derived rows tied to the stored identity. Existing callers without projections preserve existing sheets.
- [ ] Add a `projections` sheet with target/profile JSON, outcome/unit, source identity JSON, a/b, reference/horizon, status, model/remaining years, anchor and `time_uncertainty: 'not estimated'`.
- [ ] Roundtrip XLSX bytes and verify every displayed target/status, nonreference profile and source settings survive. Unavailable results retain their reasons with empty numeric fields.
- [ ] Use a workbook browser scenario to select a model, configure custom/preset targets, change profile and download/read the actual XLSX. Fit with real webR in an explicit runtime acceptance script if CI requires an injected worker seam; distinguish the two verification modes.
- [ ] Include a rising non-eGFR series, a beyond-horizon target and a stale-data change in acceptance coverage.
- [ ] Run `pnpm test`, `pnpm build`, `pnpm exec playwright test --workers=1`, and actual webR profile fits. Verify `git diff -- tests/goldens tests/parity` is empty.
- [ ] Review the final diff, fix findings, rerun affected checks, update changelog and smoke verification record, commit and open a dependent draft PR. Keep #4 open for remaining scope.
