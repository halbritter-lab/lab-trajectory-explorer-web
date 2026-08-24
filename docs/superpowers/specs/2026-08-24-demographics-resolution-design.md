# Patient Demographics Resolution Design

## Goal

Resolve each patient's sex and age **once**, before any analysis runs, and
report contradictions in the source data instead of silently computing over
them. Sex and age currently live on every lab row; where a patient's rows
disagree, the app produces a plausible-looking wrong number.

This is the correctness half of issue #3. The import-ergonomics half — a shared
header helper for all three importers, single-workbook upload, and the
harmonised demo files — is a separate change, described under Out Of Scope.

Research and exploratory analysis only; not clinical decision support.

## Motivation (findings this resolves)

- **Per-row demographics.** `computeEgfrSeries` (`src/core/egfr/series.ts:122`)
  reads `r.patientSex` and `r.patientAgeAtLab` of the individual row. A patient
  carrying conflicting sex values across rows silently receives different
  CKD-EPI coefficients within one series.
- **Manual age does not age.** `rowsWithManualDemographics`
  (`src/core/analysis/egfrModule.ts:13`) writes the entered age onto *every* row
  of the patient. Over an eight-year series the patient is the same age at both
  ends — roughly an eight percent eGFR error at the right edge of the plot, in
  the direction that makes a trajectory look flatter than it is.
- **No consistency validation exists.** Only *absence* is checked
  (`missingDemoPatientIds`, `src/ui/shell/Sidebar.tsx:76`), never contradiction.
- **The age axis invents its own anchor, twice.** `screening.ts:247-251` and
  `cohortOverlayData.ts:63-64` each take the first row carrying an age and add
  elapsed time. Two independent rules, both "first row wins".
- **Our own demo data is inconsistent.** In `public/test_labs.xlsx`, 7 of 13
  patients have `PatientAgeAtLab` values that fit no single birth date; the gaps
  run from 59 to 611 days. The same holds for 7 of 10 patients in
  `tests/fixtures/test_labs.xlsx`.

## Architecture

A new analysis module, `demographics`, becomes the first entry in
`analysisModules` (`src/core/analysis/registry.ts:41`):

    rows -> demographics -> egfr -> aki -> rapidEgfrDecline -> result.rows -> UI

The logic itself is a pure function in a new file,
`src/core/demographics/resolve.ts`:

    resolveDemographics(rows, attributes, manual) -> {
      rows: LabRow[]                     // sex and age unified across each patient
      conflicts: DemographicsConflict[]  // what disagreed, and what won
    }

The module returns `rows` and passes `conflicts` up the existing `messages`
channel. `rowsWithManualDemographics` moves out of `egfrModule.ts`, which is
then only what its name says.

Two supporting changes:

- `AnalysisContext` (`src/core/analysis/types.ts:37`) gains
  `patientAttributes`. The data already sits in the store under that name; it is
  simply not threaded into the pipeline today.
- `AnalysisResult.messages` gains its first UI consumer. The channel is
  populated by the module architecture but read nowhere (`grep` for `.messages`
  under `src/ui` returns nothing).

**Why this placement.** `egfrModule.apply` returns `{ rows: withManual }` even
when the formula is `off` (`egfrModule.ts:24`), and the registry threads those
rows through every later module into `result.rows`. `CohortView`,
`OnePatientView` and `CohortTrajectoryOverlay` all read `analysisResult.rows`.
Resolving there therefore also serves the age x-axis, the mixed-model dataset
and the exports, without touching any of those files.

**What stays untouched.** `loadLabRows` and `appendComputedEgfr` are not
modified. The parity tests run straight through those two
(`tests/parity/egfr.parity.test.ts:29-33`), not through the pipeline, so the
goldens keep their meaning: the correction sits on top of the ported core rather
than inside it, as `CLAUDE.md` requires. A golden turning red means the logic
landed in the wrong place.

## Resolution rules

### Sex — first rule that applies wins

1. Manual entry for the patient.
2. `sex` from the `attributes` table. If it disagrees with the lab-row
   majority, the disagreement is reported and `attributes` still wins.
3. Majority across the patient's lab rows. Unmappable spellings do not vote;
   `unrecognisedSexValues` (`Sidebar.tsx:97`) already reports those separately,
   on the grounds that the cause and the fix differ.
4. A tie resolves to unknown. No eGFR is computed, and the patient appears in
   the same sidebar list as missing demographics, where a manual entry resolves
   it.

### Age — one birth-date anchor per patient

Every row's age is then derived from that anchor.

1. A manually entered age, read as the age **at the patient's first lab date**.
2. `birthDate` from the `attributes` table. If it disagrees with a row's stated
   `ageAtLab`, the disagreement is reported as `age_source_disagreement` and the
   attributes table still wins — the same "report, don't silently pick a
   winner" rule sex applies to `sex_source_disagreement`.
3. `birthDate` from the lab rows. Same rule: a mismatch against another row's
   stated age is reported as `age_source_disagreement` with `source: 'labs'`,
   and the birth date still wins.
4. `ageAtLab` from the lab rows. Each row implies an interval of birth dates
   consistent with its stated age. If the intersection across all rows is
   non-empty, it is the anchor — and reproduces every stated age exactly. If it
   is empty, the contradiction is reported and the median of the per-row
   interval midpoints is used, the age counterpart to the majority rule for sex.

**The guarantee this buys:** consistent input produces byte-identical rows.
Only data that already contradicted itself moves.

### Precedence across sources

`manual > attributes > lab rows`, uniformly for both fields. The `attributes`
table may carry `sex` and `birthDate`. It may **not** carry `ageAtLab`: a single
age in a per-patient table has no reference date and cannot be interpreted.

## Conflict reporting

Conflicts surface in the `Analysis` sidebar group (`Sidebar.tsx:201`), which
already holds the two demographics notes, as a third category naming the
patient, the disagreement and the winner:

> Patient 7: 27 rows say `w`, 1 says `m` — resolved as `w`.
>
> Patient 2: age values fit no single birth date (612 days apart) — resolved
> from the median.

The list is capped as `UNREADABLE_SEX_LIST_CAP` caps its own, with the remainder
as "and N more".

One detail must **not** be copied from the neighbouring notes: both are gated on
`egfrFormula !== 'off'` (`Sidebar.tsx:235,246`) because they concern only the
eGFR. An age conflict also corrupts the age x-axis, so the new note is not gated
on the formula. The gating sits on the individual notes rather than on the
enclosing group, so an ungated note fits there without restructuring.

The cohort export gains a `demographics_conflict` column alongside
`unstable_slope` (`src/core/cohort/screening.ts:328`), so the caveat travels
with the table rather than living only in the sidebar of whoever exported it.

## Sex as a grouping attribute

`availableGroupByAttributes` (`src/ui/cohort/CohortView.tsx:144`) derives its
options exclusively from `patientAttributes`. It gains `sex` from the resolved
rows, so grouping by sex no longer requires a second spreadsheet — the original
complaint from the clinical review. If the attributes table also carries a `sex`
column there is no duplicate entry, because resolution has already merged both
sources into one value.

Age as a grouping attribute is out of scope: it needs a class definition
(decades? quartiles? clinical thresholds?), which is a separate decision nobody
has asked for.

## Demo fixture

`public/test_labs.xlsx` is regenerated so each patient's ages derive from one
birth date: the midpoint of the interval implied by that patient's earliest row,
so the data moves as little as possible. A test asserts that the shipped demo file is internally
consistent, so it cannot rot again unnoticed.

`tests/fixtures/test_labs.xlsx` is **not** regenerated. It mirrors the Python
reference data and feeds the parity goldens; leaving it inconsistent is correct,
and it doubles as a fixture for the conflict path.

## Testing

- `resolveDemographics` unit tests, with the guarantee above as the centrepiece:
  consistent input in, byte-identical rows out. Then one case each for majority,
  tie, attributes overriding labs with a report, `birthDate` anchor, empty
  intersection resolved by median, and a manually entered age that ages across
  the series — the last as a regression test for the defect that is live today.
- The existing parity tests must stay green **without modification**. That is
  the proof the ported core was not touched.
- A consistency test over the shipped demo file.
- A Playwright case for the conflict note, because sidebar geometry is worth
  nothing in jsdom.

## Acceptance

- A patient with contradictory sex is reported, not silently averaged over.
- A patient with non-monotonic age is reported, and their eGFR uses one
  consistent age basis.
- A manually entered age ages with the series.
- Sex is available as a grouping attribute without a second spreadsheet.
- The conflict note appears with the eGFR formula switched off.
- Exports carry the conflict flag.
- Parity goldens unchanged and green.

## Out of scope (the second change)

- Lifting header resolution into a shared io helper used by all three importers;
  `normalizeClinicalEvents` (`src/core/events/events.ts:73-78`) and
  `normalizePatientAttributes` (`src/core/attributes/attributes.ts:39-43`) still
  match exact spellings against the first row's keys only.
- Single-workbook upload: sheets named `labs`, `events`, `attributes`, detected
  by the presence of a `labs` sheet, with the separate-file path unchanged, and
  a multi-sheet upload replacing rather than merging what is already loaded.
- A `Geburtsdatum` alias. `COLUMN_ALIASES` (`src/core/parse/loader.ts:33`)
  accepts `birthDate` and `PatientGeburtsdatum` but not the plain German
  spelling, which `tests/fixtures/test_labs_clustered.xlsx` actually uses.
- Harmonising `public/test_labs.xlsx` headers onto the canonical scheme. The
  templates shipped in PR #5 are already canonical; the demo workbook is the
  last file carrying the old German headers.

## Deferred decision

If these conflict categories are ever described on the methodology page, that
wording is the maintainer's, per `CLAUDE.md`.
