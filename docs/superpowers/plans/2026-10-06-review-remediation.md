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

P5 package 1: Cohort models now expose an apply/skip choice for active preset
event and AKI windows, defaulting to apply. Eligible exact dated rows removed
by overlapping windows are counted once per pooled or grouped entity before
balancing, chronic run-in and factor removal. The choice and counts flow through
sample preview, entity status, result preparation and workbook export; changing
the choice clears stored fits, overlays and projection settings and changes
the fit identity. `fitModel: none` still produces no rows. Existing numeric
goldens are unaffected because the default keeps their input policy and the
new choice does not alter individual numeric kernels. Red-green tests covered
on/off with overlapping transplant and AKI windows, pooled/grouped counts,
stale results, visible choice and workbook fields. Sequential verification:
803/803 unit tests in 90 files, production build, 29/29 Chromium checks and
both real-webR verification scripts passed. The pre-existing React `act`
warnings remain in storage tests. P5 minimum-data and singular-fit policy
remains for a separate package.

Final P4 individual G5 projection package: endpoint-only OLS/Theil-Sen slope
confidence bounds now control whether an individual crossing is reported.
Intervals touching zero and unavailable/inverted bounds have distinct withheld
reasons. The crossing is reported at exactly 20 years after the latest eligible
measurement and withheld beyond it; observed G5, KRT and no-fit precedence is
retained. Cohort exports include endpoint-fit bounds, reason and horizon, kept
separate from display-fit CI columns. Badge and Methods copy use neutral
wording; the total-change badge now names its first-to-latest basis and G4/G5
badges name the 12-month confirmation maximum. Existing goldens do not contain
affected endpoint projection records and were deliberately unchanged. Focused
red-green tests covered CI, missing bounds and the horizon boundary. Final
verification: 800/800 unit tests in 90 files, production build and 29/29
Chromium checks passed. Existing React `act` warnings in storage tests remain.

Whole-P4 review completed after the final package. It found no major issue on
the normal import path. Deferred Minor findings for owner policy review:

- `endpointEventPolicy` can pair an invalid direct event with an eligible lab
  from the same UTC day whose timestamp differs; exact-time matching and
  date-only matching would give different results.
- `ckdEndpoints` accepts a directly supplied positive slope confidence
  interval alongside a negative slope. Normal imported data computes these
  values together, but inconsistent direct inputs need a policy decision.
- `summarize` can include excluded-bound dates in its raw span and `reason`;
  this follows the pre-existing raw-span convention for exclusions.

Two P4 policy rulings have known costs: 40 %/57 % decline candidates start
strictly after the 90-day baseline window, so a decline within that window is
not reported as a candidate; future individual G5 crossings are withheld once
KRT is reached, so a possible pre-KRT counterfactual crossing is not shown.
Neither cost was changed during close-out. The manual single-interface smoke
steps were not rerun for P4, and representative research-data acceptance is
still pending; `tests/e2e/smoke.md` distinguishes those from automated evidence.

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

Then P5–P7 as above. Owner review pending: UI-reference sentences changed on
the methodology page (P2) and the new cohort-model sentence on time origin and
missing factors.

First P4 package completed: `<x` and `>x` rows stay in raw counts and charts but
are excluded by row operator from individual/cohort fits and slope lines,
endpoints and prediction, AKI source selection and detection, and mixed-model
datasets. Derived eGFR retains its reversed display bound. Import, table,
chart, export, method and decision text now state the policy. Focused TDD
regressions cover same-date exact rows, bound-only series, endpoint confirmation,
AKI, mixed models, derived eGFR and visible labels. Existing goldens did not
change: bounded operators there test parsing only. Final verification: 762/762
unit tests (90 files), build passed, 29/29 Chromium tests. A concurrent unit
run with build/e2e had five unrelated storage/model UI failures, including a
timeout; the standalone unit rerun passed. Existing React `act` warnings remain
in storage tests. Remaining P4 endpoint/KRT and KDIGO/µmol/l packages are open.
Follow-up review fix: the `<2` exact-point summary path now applies fit
exclusion windows before reporting `nFitted`, and disabled fits report zero
even with one exact point plus a bound. Two tests failed before the fix and
pass after it. Sequential verification: 44/44 focused tests, 764/764 full unit
tests (90 files), production build passed. Other P4 scope remains open.

Second P4 package: KDIGO threshold comparisons now use a 1e-12 tolerance,
including the stage-1 floor; eligible serum creatinine µmol/l sources are
converted to mg/dl for direct and cross-series AKI detection. The central
88.42 conversion also remains in eGFR derivation for every eligible selected
µmol/l source; the single selected name/unit pair is unchanged. Exact boundary,
just-below, unit spelling, source isolation and bound-exclusion tests were added.
Endpoint/KRT and other P4 work remains open. Deferred Minor policy question for
final review: `summarize.ts` can use dates of excluded bounds in its raw
span/reason calculation; this matches the existing raw-span convention for
other exclusions and was intentionally not changed in this AKI package.
Golden AKI/eGFR parity cases still use mg/dl values away from the changed
boundaries and passed unchanged, so no golden numeric values moved. Final
sequential verification after the marker-unit follow-up: 52/52 focused tests,
773/773 unit tests (90 files), production build and 29/29 Chromium tests.
Existing React `act` warnings remain in the storage unit tests.

Third P4 package: eGFR endpoint rows stop before the earliest transplant or
chronic dialysis date, and complete dated acute dialysis intervals exclude both
boundary days while retaining later values. Unknown-intent and incomplete acute
events do not silently censor. The endpoint values and individual projection
fit consume identical eligible exact rows, independently of display-fit
settings. Kidney failure reached is a separate dated KRT result in cohort badges
and exports, even if observed G5 is off or a prior G5 was lab-confirmed. Raw
points remain visible. The saved FitConfig shape is unchanged. Existing numeric
goldens contain no affected event inputs and were intentionally not updated.
The 40/57% confirmed declines, 12-month confirmation maximum and 20-year/CI
projection limits remain for later P4 packages.
Sequential verification: 780/780 unit tests (90 files), production build,
29/29 Chromium tests. Existing React `act` warnings remain in storage tests.
Review follow-up: raw dated numeric eGFR series presence now controls KRT
reporting, so a series with only on/after-KRT labs still reports kidney failure
reached. Future G5 projection is withheld after KRT with its own reason and
neutral UI label. Earlier lab-confirmed G5 remains visible beside KRT. The
tradeoff is that no pre-KRT counterfactual crossing is shown; the owner may
revisit that optional estimate. Other P4 packages remain separate.
Review follow-up verification: 35/35 focused tests, 782/782 full unit tests
across 90 files, TypeScript no-emit check and production build passed. The
browser suite was last run for the preceding endpoint/KRT package (29/29);
this focused review fix did not rerun it.

Fourth P4 package: confirmed 40 % and 57 % eGFR decline endpoints use the
arithmetic mean of eligible exact rows from the first eligible UTC date through
90 elapsed UTC days inclusive. Candidate search starts after that window, so a
baseline input cannot also be an event candidate; the cost is withholding early
confirmed decline dates if the owner intended within-window candidates. A
nonpositive baseline is unavailable. Threshold equality counts, and 57 % is a
creatinine-doubling surrogate. All four observed endpoints now require
confirmation from the configured minimum interval through 12 UTC calendar
months inclusive, with end-of-month clamping and expired candidates restarted
at a later crossing. Same-time precedence and recovery are retained. The total
first-to-latest percent change remains separate. Existing numeric goldens do
not contain affected event histories; no fixture values were changed.
TDD covered baseline UTC day 90/91 and duplicate rows, nonpositive baselines,
exact and just-below thresholds, minimum/maximum confirmation boundaries,
leap-day and same-date clamping, expired-candidate restart, same-time conflicts,
source-order values, independent recovery and workbook provenance. The remaining
P4 G5 projection horizon/CI package is separate.
Final sequential verification: 792/792 unit tests in 90 files, production
build, and 29/29 Chromium tests passed. The first Chromium run exposed a stale
KRT label assertion and a large-cohort import timeout under parallel load;
the assertion now follows the approved KRT policy, the import passed alone,
and both complete reruns after that change passed. Existing React `act`
warnings remain in storage tests.
Scoped provenance re-review: when a prior lab-confirmed G5 precedes KRT,
`observed_ckd_g5` remains the projection reason, but no endpoint projection
fit was run. The cohort export now blanks its prediction anchor and model
whenever KRT is present, consistently with the method algorithms. The lab G5
and KRT fields remain present. Red-green workbook regression passed; sequential
verification: 35/35 focused tests, 782/782 full unit tests (90 files),
TypeScript no-emit check and production build. Browser tests were not rerun.
Independent review follow-up: the user-facing AKI methodology still described
mg/dl as its only input after the SI-unit implementation. It now names both
eligible units, the 88.42 conversion, exact-row selection and 1e-12 tolerance.
The adjacent stage-I description also now includes the 0.3 mg/dl absolute
criterion, which the detector and method algorithms already applied. A focused
rendered-copy test failed before the fix and passed afterward. Sequential
verification: 25/25 focused tests, 774/774 unit tests (90 files), and
production build passed. The existing storage-test React `act` warnings remain.
