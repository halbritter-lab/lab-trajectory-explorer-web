# Configurable mixed-model factors implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Configure patient attributes as level or level-and-slope predictors, preview complete-case exclusions, fit the chosen model, display all coefficients and export the settings/results.

**Architecture:** Extend the existing mixed-model config additively. Prepare patient-level covariates after measurement selection, remove incomplete patients before centering, and pass safely named factor columns to webR. Keep legacy configs and unadjusted model behavior compatible. UI uses the same prepared rows for preview, fit and result identity.

**Tech Stack:** TypeScript, React, Zustand, webR/lme4/nlme, Vitest, Playwright, SheetJS.

**Spec:** `docs/superpowers/specs/2026-09-13-research-models-proposal.md`; factor selection and the genotype example were approved in conversation on 2026-09-13. Dated interventions and threshold-time models remain outside this implementation.

## Global constraints

- Keep existing numerical parity fixtures unchanged.
- Factors have explicit numeric/categorical interpretation and categorical reference levels.
- Three choices per variable: excluded, level, level and slope.
- Retain patients outside this model when their selected covariates are missing.
- No automatic imputation, coefficient dropping or silent model simplification.
- Preserve existing random-effect options and legacy `covariates: ['baseline_age']` behavior.
- Factor names/data must never be interpolated into executable R identifiers.
- Default existing model remains unchanged; an explicit genotype-example action selects genotype, baseline age and sex for level-and-slope effects.

## Contracts

```ts
interface MixedModelFactor {
  key: string // baseline_age and sex are resolved built-ins; other keys name patient attributes
  kind: 'numeric' | 'categorical'
  effect: 'level' | 'level_slope'
  reference?: string
}
// MixedModelConfig adds factors?: MixedModelFactor[]; defined factors override legacy covariates.
// config.ts exports mixedModelFactors(config), mixedModelFactorColumn(factor,index).
// baseline_age column: baseline_age_centered; other columns: factor_<index>_.
// MixedModelSpikeRow adds factorValues?: Record<string, number|string>.
interface MixedModelPreparationSummary {
  nPatientsBefore: number
  nMeasurementsBefore: number
  excludedPatients: Array<{patientId: string; reasons: string[]}>
  centers: Record<string, number> // generated numeric column -> patient-weighted mean
}
// Worker options/request and result metadata add preparation?: MixedModelPreparationSummary.
// MixedModelSuccess adds fixedEffectTerms?: Array<{
//   term:string; estimate:number; confidenceInterval:[number,number]|null
// }> while retaining existing named fixedEffects fields.
```

## Task 1: Configuration, runtime and result contract

Files: `src/core/mixedModel/{config,types,validation,webr.worker,webrResultNormalization,workerProtocol,browserClient}.ts` and corresponding core tests.

- [x] Write tests asserting safe generated columns, numeric/categorical factors, references, both interaction modes, legacy config keys, duplicate/invalid factors, hash sensitivity and all coefficient extraction.
- [x] Run targeted tests and confirm new assertions fail before implementation.
- [x] Implement config helpers, factor validation and row hashes. Bind factor arrays as JSON data; explicitly set treatment contrasts/reference ordering and reject rank-deficient designs. Generate supported lme4/nlme calls from validated config. Preserve all finite coefficients/intervals and preparation metadata.
- [x] Validate against existing worker tests and a real runtime synthetic fit.

Example required assertion:
```ts
expect(mixedModelFormula({ ...DEFAULT_MIXED_MODEL_CONFIG, factors: [
  {key:'genotype', kind:'categorical', effect:'level_slope', reference:'A'}
]})).toContain('time_since_baseline:factor_0_')
```

## Task 2: Patient factors, complete cases, identity and plotting

Files: create `src/core/mixedModel/factors.ts`; modify `cohortModelEntity.ts`, `cohortModelFit.ts`, `resultIdentity.ts`, and overlay plumbing. Tests in `tests/core/mixedModel/factors.test.ts` and existing identity/run tests.

Interfaces:
```ts
prepareMixedModelFactors(rows, config, attributes, resolvedRows)
// => { rows: MixedModelSpikeRow[], preparation: MixedModelPreparationSummary }
availableMixedModelFactors(rows, attributes)
// => Array<{key:string,label:string,levels:string[],numeric:boolean}>
```

- [x] Test incomplete-patient removal, resolved sex precedence, numeric parsing, missing selected keys, patient-weighted centering after exclusions, category levels and no changes for legacy models.
- [x] Implement preparation using existing selected model rows; pass summaries through entity/run boundaries.
- [x] Ensure result identity includes factor values and config, and adjusted reference lines are labeled correctly or not offered as unadjusted means.
- [x] Run factor, hash and identity regression tests.

## Task 3: Model settings, preview, results and export

Files: `src/ui/cohort/{CohortModelPanel,CohortModelTable,CohortView}.tsx`, optional focused components; new `src/core/mixedModel/modelExport.ts`; UI/core export tests.

- [x] Test selectors, explicit category reference, genotype preset, draft formula, exclusion preview and applied factor identity.
- [x] Render factors from available patient attributes and built-ins, preserve legacy age setting when opening old config. Prepare both draft and applied rows using Task 2 interface.
- [x] Show all fixed-effect terms with readable factor labels, intervals and warnings; identify reference slope/intercept for adjusted models.
- [x] Export coefficient, config, reference, centering, exclusion and research-use metadata, tied to the stored fitted result.
- [x] Add a real-workbook browser regression for the configuration preview/export path.

## Task 4: Integration and review

- [x] Run `pnpm test`, `pnpm build`, and `pnpm test:e2e -- --workers=1`.
- [x] Perform a real webR fit with synthetic genotype-dependent intercepts/slopes and verify coefficient extraction; distinguish environmental runtime failures from passing mocked tests.
- [x] Independent code review, correct findings, rerun affected checks.
- [x] Update spec status/changelog, commit on feature branch, report validation and remaining limitations.

## Verification outcome (2026-09-13)

- Full Vitest suite: 85 files, 711 tests passed; subsequent inherited-attribute regression: all 8 factor-preparation tests passed.
- Production build passed; existing large-chunk advisory remains.
- Chromium browser suite: all 11 tests passed.
- Actual production webR worker: lme4 and nlme recovered all six known synthetic coefficients with finite intervals; both rejected a rank-deficient design.
- Independent review completed; corrected preparation identity, export provenance and coefficient-name ambiguity. Existing numerical parity fixtures are unchanged.
