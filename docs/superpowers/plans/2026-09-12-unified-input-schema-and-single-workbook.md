# Implementation Plan: Unified Input Schema and Single-Workbook Upload

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the import half of Issue #3 and the three follow-up review findings from demographics resolution:
1. Lift header resolution into a shared I/O helper with case/separator insensitivity and ambiguity detection, and use it across labs, events, and attributes.
2. Accept aliases in patient attributes, canonicalizing `sex` and `birthDate` so demographics resolution and cohort grouping work seamlessly without duplicate columns.
3. Cross-check explicit birth dates from attributes vs. lab rows, reporting disagreements instead of silently switching anchors.
4. Fall back to the earliest stated age for the manual-age dialog prefill when the anchor row carries no age.
5. Support single-workbook upload with `labs`, `events`, and `attributes` sheets in `.xlsx`, while keeping the separate-file workflow intact.
6. Harmonize the shipped demo workbook `public/test_labs.xlsx` to canonical English camelCase across all three sheets.

**Status:** IN PROGRESS on `feat/unify-input-schema-and-single-workbook`

---

## Tasks

### Task 1: Shared Header Resolution Helper (`src/io/headers.ts`)

- [ ] **Step 1: Write tests for `src/io/headers.ts`** (`tests/io/headers.test.ts`)
  - Test case-insensitivity and separator stripping (`PatientID`, `patient_id`, `Patient ID`).
  - Test alias precedence matching.
  - Test ambiguous column detection (throws when two distinct file headers normalize to the same consumed alias).
  - Test required columns validation.
  - Test `collectHeaders` across raw rows.
- [ ] **Step 2: Implement `src/io/headers.ts`**
  - Export `normaliseHeader(header: string): string`
  - Export `collectHeaders(rows: readonly RawRow[]): Set<string>`
  - Export `resolveColumns<K extends string>(headers: Iterable<string>, aliases: Record<K, readonly string[]>): Partial<Record<K, string>>`
  - Export `cell(row: RawRow, resolved: Partial<Record<string, string>>, key: string): unknown`
  - Export `checkRequiredColumns<K extends string>(resolved: Partial<Record<K, string>>, required: readonly K[], label: string): void`
- [ ] **Step 3: Refactor `src/core/parse/loader.ts` to use `src/io/headers.ts`**
  - Replace internal `normaliseHeader` and `resolveColumns` with imports from `../../io/headers`.
  - Verify all unit and parity tests pass: `pnpm exec vitest run tests/core/parse/loader.test.ts tests/parity`.
- [ ] **Step 4: Commit**
  - `git commit -m "feat(io): lift header resolution into shared helper"`

---

### Task 2: Events and Attributes Tolerant Header Resolution

- [ ] **Step 1: Update `src/core/events/events.ts`**
  - Use shared header resolver with `EVENTS_COLUMN_ALIASES`.
  - Accept `patientId`, `PatientID`, `patient_id`, `Patient ID`.
  - Fix legacy header check: only reject when `ReferenceDate` or legacy `label` without `title`/`type` is present; do NOT reject valid `PatientID` column headers.
  - Update and add tests in `tests/core/events/events.test.ts`.
- [ ] **Step 2: Update `src/core/attributes/attributes.ts`**
  - Use shared header resolver for `patientId`.
  - Canonicalize demographics attribute keys: if an attribute column matches `sex` aliases (`sex`, `PatientSex`, `Sex`, `Geschlecht`), map it to canonical key `'sex'`. If it matches `birthDate` aliases (`birthDate`, `PatientGeburtsdatum`, `Geburtsdatum`, `BirthDate`), map it to canonical key `'birthDate'`.
  - Keep other attribute columns intact.
  - Reject ambiguous attribute headers (e.g. both `Sex` and `Geschlecht` in the same file).
  - Update and add tests in `tests/core/attributes/attributes.test.ts`.
- [ ] **Step 3: Verify tests pass**
  - `pnpm exec vitest run tests/core/events/ tests/core/attributes/`
- [ ] **Step 4: Commit**
  - `git commit -m "feat: tolerant header resolution and demographics canonicalization for events and attributes"`

---

### Task 3: Demographics Resolution Follow-up Fixes

- [ ] **Step 1: Cross-check explicit birth dates in `src/core/demographics/resolveAge.ts`**
  - Add `birth_date_source_disagreement` to `DemographicsConflict` in `src/core/demographics/types.ts`.
  - Implement wording in `src/core/demographics/describe.ts`.
  - In `resolveBirthAnchor`, when `attributeBirthDate` is present, check if `rowsWithBirthDate` has a date from lab rows. If they differ, add `birth_date_source_disagreement`. Attributes table still wins as the anchor.
  - Write failing test in `tests/core/demographics/resolveAge.test.ts`, run and verify, then pass.
- [ ] **Step 2: Fall back manual-age dialog prefill when anchor row has no age (`Sidebar.tsx`)**
  - In `openDemographicsDialog`, when `anchorRow.patientAgeAtLab === null`, fall back to the earliest dated row that carries an age (or any row with an age). Anchor date remains the all-series earliest date.
  - Write test in `tests/ui/Sidebar.test.tsx` verifying the prefill value when the earliest row has null age.
- [ ] **Step 3: Commit**
  - `git commit -m "fix(demographics): cross-check explicit birth dates and fall back manual-age prefill"`

---

### Task 4: Single-Workbook Multi-Sheet Upload

- [ ] **Step 1: Extend `src/io/readWorkbook.ts` for multi-sheet discovery**
  - Add `readWorkbookSheets(data: ArrayBuffer | Uint8Array): { sheetNames: string[], getSheet(nameOrIndex: string | number): RawRow[] }`.
  - Add sheet classification helpers: identifying `labs`, `events`, and `attributes` sheets by case-insensitive name matching.
- [ ] **Step 2: Extend `src/ui/data/loadDataset.ts`**
  - Add `loadDatasetFromWorkbook(data: ArrayBuffer): LoadedDataset`:
    - Reads sheets. If multi-sheet with `labs` (or sheet 0) plus `events` and/or `attributes`: parses labs, events (with validation), and attributes (with validation).
    - If single-sheet or non-matching names: behaves exactly as existing `datasetFromArrayBuffer`.
- [ ] **Step 3: Wire into `src/ui/state/store.ts`**
  - In `loadFile(file: File)`: use `loadDatasetFromWorkbook(buf)`. If events/attributes are present in the workbook, populate them in store with status note: `Loaded X rows, Y events, and Z attribute rows from <filename>.`
  - Keep separate-file handlers `onEventFile` and `onPatientAttributesFile` in `Sidebar.tsx` intact.
- [ ] **Step 4: Write tests for multi-sheet loading**
  - `tests/ui/data/loadDataset.test.ts` & `tests/ui/state/store.test.ts`.
- [ ] **Step 5: Commit**
  - `git commit -m "feat(io): support single-workbook upload with labs, events, and attributes sheets"`

---

### Task 5: Harmonize Demo Files and Update `public/test_labs.xlsx`

- [ ] **Step 1: Build multi-sheet `public/test_labs.xlsx`**
  - Create a regeneration script `scripts/build_demo_multisheet_workbook.mjs`.
  - Sheet 1: `labs` with English camelCase headers (`patientId, labDate, testName, unit, value, loinc, sex, ageAtLab`), populated from existing `public/test_labs.xlsx`.
  - Sheet 2: `events` with English camelCase headers, populated from `public/test_events.csv`.
  - Sheet 3: `attributes` with English camelCase headers, populated from `public/test_attributes.csv`.
  - Run script to write `public/test_labs.xlsx`.
- [ ] **Step 2: Update `loadBundledFixtureData` in `src/ui/data/loadDataset.ts`**
  - Directly load all 3 datasets from `test_labs.xlsx` in one fetch! (With fallback to separate fetches if needed).
- [ ] **Step 3: Update `tests/io/demoFixture.test.ts`**
  - Assert that `public/test_labs.xlsx` loads all three sheets without warnings or conflicts.
- [ ] **Step 4: Commit**
  - `git commit -m "chore(data): harmonize demo workbook to multi-sheet English camelCase"`

---

### Task 6: Final Verification and Documentation

- [ ] **Step 1: Run full test suite and build**
  - `pnpm test` (all unit and parity tests must pass).
  - `pnpm build` (clean Vite build).
  - Parity diff `git diff main --stat -- tests/parity tests/goldens` must remain empty.
- [ ] **Step 2: Update `CHANGELOG.md`**
  - Document single-workbook upload, tolerant header resolution, and demographics fixes under `[Unreleased]`.
- [ ] **Step 3: Commit and review**
