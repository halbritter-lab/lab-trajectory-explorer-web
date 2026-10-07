# Working in this repo

Notes for anyone — human or agent — picking up work here. Conventions and
gotchas that are not obvious from the code.

## Language and checkpoints

- Application copy, accessibility labels, generated export labels and new user
  documentation are English. Preserve imported names, values and units verbatim.
- Commit coherent, verified work packages regularly during implementation; do not
  leave an entire multi-agent workflow uncommitted until its final review.

## Verification

`pnpm test` and `pnpm build` are the floor, not the bar. CI runs both on every
pull request (`.github/workflows/ci.yml`) and again before deploy.

Two things the Vitest suite cannot see, because it runs in jsdom:

- PNG export (`svgStringToPngBlob` needs a real canvas), file downloads,
  narrow-viewport layout, IndexedDB behaviour across tabs and reloads, and the
  graph table's jump-to-parameter scrolling, which reads
  `getBoundingClientRect` and gets zeros in jsdom.
- Anything about how a real workbook behaves end to end.

After `pnpm install`, run `pnpm exec playwright install chromium` once on a new
machine. `pnpm test:e2e` then runs the stable browser-regression subset in
Chromium against the workspace at `/` (the only interface since 2026-10-06):
the PR 5 quality and endpoint labels, AKI and endpoint badges side by side,
import warnings, template and demo downloads, the mobile methodology path,
cohort-model factors and projections, local storage, and the `workspace.html`
redirect. CI installs Chromium and runs the suite after the unit tests and build.

`tests/e2e/smoke.md` remains the broader manual checklist for paths that are too
expensive or subjective to automate. It carries a "Verified <date>" line per
phase — update it, and correct steps that have drifted rather than leaving them
to rot.

**Run a code review before calling a branch done.** In August 2026 an agentic
review of PR #5 found three serious defects in code that had already been
manually clicked through in a browser and reported as verified: a badge that
claimed "fewer than three measurements" for a ten-point series, a "G5 unlikely"
label rendered for a patient whose eGFR was collapsing, and a point count taken
before exclusions. All three lived in states manual clicking had not visited —
a non-default preset, the no-fit path, and quarterly time balancing. Clicking
around confirms the happy path and little else.

## Numeric core: deliberate changes only

`src/core/` started as a port of the Python `analyses` package. Since
2026-10-06 the Python reference is no longer binding (see
[method decisions](docs/remaining-method-decisions.md)). The golden fixtures
(`tests/goldens/*.json`) stay as regression tests. **Do not change numeric
output to fix a UI problem.** A numeric change needs an owner decision, an entry
in the method decisions and [method algorithms](docs/method-algorithms.md), a
changelog line, and a deliberate fixture update that states why the values moved.

Three places where the core behaves in a way that surprises readers. All are
documented at the call site, and this list exists so they are findable:

- `fitGlobal` (`src/core/stats/series.ts`) special-cases exactly two points: it
  returns the exact two-point slope with `r2 = 1` and `reason: null`. A
  two-point series over a long span therefore looks like the best-fitting series
  in the cohort.
- `summarizeByBezeichnung` (`src/core/stats/summarize.ts`) emits
  `reason: 'n_below_threshold'` whenever `fitModel === 'none'`, regardless of how
  many points exist. The `reason` field alone cannot be trusted to describe the
  data.
- `nNumeric` counts raw measurements **before** clinical-event censoring, AKI
  exclusion and time balancing. Use `nFitted` for anything about the fit —
  quarterly medians (the CKD-progression default) can collapse eight raw values
  into two fitted points.

`src/core/stats/slopeQuality.ts` is the app's own reliability rule, layered over
these. Keep it separate from `reason` for exactly that reason.

## Method reference: complete and as implemented

[docs/method-algorithms.md](docs/method-algorithms.md) specifies every rule
that decides which data are analysed, how a number is derived and how a result
is classified — import and parsing included, not only statistics. The owner
requires it to stay complete: a change to such a rule updates the matching
section in the same change, with concrete values, boundary conventions and a
recomputed example.

It describes what the code does, not what was intended. Where behaviour
conflicts with other documentation or looks unintended, describe it as it is
and add an `Open decision OD-n` marker plus a row in that file's list; do not
quietly fix either side. Removing a marker needs the owner's decision. Read
the open-decision list before touching the affected code: several entries
describe behaviour the interface does not make visible, such as cohort models
never receiving the preset exclusions (OD-1).

## Issues and pull requests

- Follow [the development and release rules](docs/release-process.md): target
  `main` for reviewed development work. Publication occurs only through a regular
  GitHub Release after user acceptance of complete workflows. Passing CI alone
  does not authorize publication.

- **Split issues by domain and sign-off path**, not by which files they touch:
  quick wins, UI restructuring, data structure, statistics/clinical. The axis
  that matters is who has to approve the change.
- **Keep the issue count low.** A new finding that fits an existing issue's
  scope goes into that issue's body as a checklist item — pick the issue that
  already owns the affected file, and say why it landed there. Only file a new
  issue when nothing existing fits.
- When a point inside a larger enhancement issue is really a silent correctness
  bug, add the `bug` label to that issue rather than splitting it out.
- **This repository is public.** Paraphrase feedback from external partners
  instead of quoting it verbatim; unattributed quotes still identify people.
- No AI co-authorship trailers in commits, PR bodies, or anywhere else.

## Clinical framing

Research use only, stated in the footer, the methodology page and every export.
Anything that reads as a prognosis needs care: the methodology page publishes
methodological recommendations under the maintainer's authorship, so changes to
that wording are his call, not a drive-by edit.
