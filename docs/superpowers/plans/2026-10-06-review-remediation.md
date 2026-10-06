# Review remediation (2026-10-06)

Branch `fix/review-2026-10`. Source: full repository review of 2026-10-06 and
the owner decisions recorded in
[method decisions](../../remaining-method-decisions.md#decisions-of-2026-10-06-full-repository-review).
Packages run sequentially; each ends with tests, build, review and one or more
coherent commits. No AI co-authorship trailers.

## P1 Import robustness (engineering)

- CSV is read as text: no SheetJS type inference (`raw`/string cells), UTF-8.
  Decimal commas, leading-zero IDs and ranges survive to `parseWert`/loader.
- Numeric Excel serial dates in date columns are converted (1900 system),
  not turned into year-45000 dates; implausible dates are rejected with a
  diagnostic. Ambiguous slash dates (`03/01/2024`) are interpreted day-first
  (German exports) and reported; impossible dates (`2021-02-30`) rejected.
- Import diagnostics for: exact duplicate rows, censored values (`<`/`>`),
  unit spelling variants of the same analyte (`mg/dl` vs `mg/dL`, `µmol/l` vs
  `umol/L`) with harmonisation of case/µ-u spelling.
- Missing-columns message names the columns actually missing and those found.
- Regression tests go through `readWorkbook`/`loadDatasetFromWorkbook`.

## P2 Single interface (UI consolidation)

- Feature gap check legacy `src/ui` vs `src/workspace`; port missing features
  or record deliberate drops.
- Workspace becomes `index.html`; `workspace.html` redirects. Legacy-only
  components, store state and legacy persistence removed. Shared code still
  living under `src/ui` (store parts, labels, methodology page, loaders) moves
  to a neutral location.
- Storage: dedicated IndexedDB store name; one sweep at boot deleting legacy
  `lab-explorer:*` keys; expiry checked before schema validation.
- Unit and e2e tests, smoke checklist and docs updated.

## P3 Modular analysis core (architecture, behaviour-preserving)

- One nephrology analyte definition (creatinine/eGFR predicates, units, names)
  and central KDIGO/default constants.
- Censoring rules from one source; overlay copy removed.
- Workspace presets and cohort specs built from core builders.
- Generic exclusion-window seam replacing the hard-wired AKI path in
  summarize/slopeLines/screening/cohortDataset (core no longer imports aki).
- Open module registry: per-module settings, defaults and validators;
  `cohortFlags`/`overlays` consumed generically; rapid decline emitted by its module.
- Neutral mixed-model outcome name (`value`), formula labelled with the series.
- No numeric output changes; goldens stay green.

## P4 Clinical and statistical changes (owner decisions)

- Endpoints truncated at transplant / chronic dialysis; acute dialysis interval
  excluded; KRT start reported as kidney failure reached.
- G5 projection: 20-year horizon, none when slope CI includes zero, neutral wording.
- Confirmed 40 % / 57 % decline endpoints, baseline = mean of first 90 days.
- 12-month maximum confirmation window for all threshold endpoints.
- Censored values excluded from fits/endpoints and marked.
- KDIGO comparisons with tolerance; µmol/l creatinine converted for AKI
  detection and eGFR from all serum-creatinine sources.
- Methodology page, method algorithms, exports and goldens updated deliberately.

## P5 Cohort models

- Optional application of the preset's censoring/AKI exclusions, visible in
  the interface and exports with excluded counts.
- Stricter minimum data, singular fits flagged and projections withheld,
  methodology text on time origin and dropout.

## P6 Usability

- Large cohorts (2000 patients): no multi-second freezes on navigation.
- Readable diagnostics, case-insensitive event types, pluralisation, mobile
  overflow, keyboard/touch-accessible badge explanations, excluded points drawn
  distinctly, offline/CDN message for the R runtime, model status column,
  sex-code note only when relevant, export filename sanitising, stale expiry
  message, PNG legend, pediatric eGFR reason.

## P7 Engineering hygiene

- CI permissions, timeouts and browser caching; patched dev dependencies
  (vite/vitest alignment); golden generator note; fixture provenance note.

## Final

Whole-branch review, `pnpm test`, `pnpm build`, `pnpm test:e2e`, smoke
checklist update, changelog.

## Progress (2026-10-06)

Done and reviewed: P1 (import), P2 (single interface, dedicated storage).
P3 implementation committed: steps 1–7 (`deada55`..`e16c2b1`), shared
clinical-event code arrays with the storage exhaustiveness guard (`c043267`),
and the architecture guide, core-layering test and settings-parser tests
(`e50a04b`). The earlier P3 checkpoint recorded 750 unit tests, a build,
29 browser tests and both real-webR verification scripts. The current branch
has since passed 29/29 automated Chromium browser tests. P3 smoke checklist
and changelog close-out are recorded here. Independent whole-P3 review is
complete: it found one documentation error in the HbA1c 7 % projection example
(`docs/architecture.md`), corrected in the follow-up documentation commit; no
numeric code changed.

Then P4–P7 as above. Owner review pending: UI-reference sentences changed on
the methodology page (P2) and the new cohort-model sentence on time origin and
missing factors.
