# Research-data acceptance

Prepared 2026-10-06, after PR #16 merged the real-data workspace into main.
This is the remaining gate before release 0.3.0 (see
[completion backlog](workspace-completion-backlog.md), sections 4 and 6, and the
[release process](release-process.md)). Automated tests use synthetic data and
cannot establish this acceptance.

Run the app locally (`pnpm dev`, then open `/`) or from a local production
build. Since 2026-10-06 the workspace is the only interface; `/workspace.html`
redirects to it. Data stay in the browser. **Do not commit research files,
screenshots with patient data, or patient identifiers to this public
repository.** Record results below in anonymous terms (cohort size, parameter
names, counts), not patient-level values.

## Inputs to prepare

- [ ] One or two representative research workbooks, ideally including an eGFR
  cohort with creatinine, demographics, clinical events (transplant, dialysis)
  and patient attributes such as genotype.
- [ ] The research questions they should answer: outcomes, covariates, groups
  to compare, and which exports feed the downstream analysis.
- [ ] Two or three patients whose course you already know well enough to check
  the app's slopes, events and projections by hand.

## Run-through

The steps deliberately visit non-default states. The August 2026 review of
PR #5 found defects that manual happy-path clicking had missed; all of them lived
in a non-default preset, the no-fit path, or quarterly aggregation.

### Data

- [ ] Import completes; rejected rows and warnings are understandable and match
  what you expect from the file. Loaded events and rejected event rows are
  listed as expected.
- [ ] If you used the former interface with "remember" on this browser, its saved
  data is removed at start-up and the Data page says so once.
- [ ] Demographics: sex and age are resolved; contradictions are reported, and a
  manual edit changes the derived eGFR of that patient only.
- [ ] eGFR derivation: the chosen formula and source parameter are correct; the
  preview values match a hand calculation for one known patient.

### Trajectories

- [ ] Graph table with the parameters you need; search, group filter, sorting by
  slope and by latest value give the expected order.
- [ ] Run each preset at least once on eGFR: General exploration,
  Theil–Sen robust trend, CKD progression (quarterly medians, censoring,
  AKI exclusion), Acute review (no fit). Check that slopes, fitted lines and
  quality notices change in a way you can explain.
- [ ] Rolling OLS and Segmented OLS from the advanced settings.
- [ ] For each known patient: slope, number of fitted points, excluded
  measurements and their stated reasons are plausible. Excluded measurements
  appear as grey open circles in the charts.
- [ ] With **AKI windows and episodes** on, the marked episodes and windows
  match creatinine courses you know.
- [ ] Overlay: grouping and unreliable-fit markers make sense for the cohort.
- [ ] Reversing a metric sort gives the expected order.

### Endpoints (eGFR)

- [ ] Observed G4 and G5 for a patient with a known course: event date,
  confirmation date and any later recovery match your own reading.
- [ ] Change the minimum confirmation interval (for example 90 → 180 days) and
  confirm that events appear or disappear as expected.
- [ ] Projected age to G5: plausible for a declining patient; unavailable with a
  sensible reason for stable, short or already-low courses.

### Cohort models

- [ ] Fit a model that answers one of the prepared questions, with the intended
  covariates and reference categories.
- [ ] Coefficients, reference-trajectory preview and projections are plausible
  and use the units you expect.
- [ ] After fitting a grouped model, the trajectory overlay grouped by the same
  attribute shows one reference line per fitted group.

### Exports

- [ ] Cohort and patient XLSX open in the downstream tool; column names and
  order work for the analysis scripts.
- [ ] Endpoint provenance columns are filled for eGFR with endpoints enabled and
  blank for other parameters.
- [ ] SVG/PNG charts are readable and carry the research-use attribution.

### Practicality

- [ ] Record cohort size (patients × parameters × measurements) and whether
  any page felt slow. Note especially edits on the Data page with a large
  cohort loaded; other pages currently recompute in the background.
- [ ] Optional local saving: reload restores the data; deletion removes it.

## Results

Record each run here: date, who, anonymous description of the data, result per
section, and the issue that received each finding (#2 for UI and workflow, #4
for clinical and statistical questions; see the repository's issue rules).

| Date | Tester | Data (anonymous) | Result | Findings |
| --- | --- | --- | --- | --- |
| | | | | |

## Decisions after the run

- [ ] Accepted for release 0.3.0, or list the blocking findings.
- [ ] Retained extensions (interventions, event-time analysis, input-column
  mapping, saved projects, further derivations, exploratory estimators): needed
  for 0.3.0, scoped for later, or explicitly deferred. See the
  [completion backlog](workspace-completion-backlog.md), section 5.
