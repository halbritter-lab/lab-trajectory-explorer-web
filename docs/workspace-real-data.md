# Real-data workspace

Run `pnpm dev --host 127.0.0.1`, then open `http://127.0.0.1:5173/`.
For production-build checks, run `pnpm build` and `pnpm preview`.

The workspace is the only interface of Lab Trajectory Explorer and is served at
`index.html`. The former interface was removed on 2026-10-06; `workspace.html`
remains as a redirect to `index.html` (query and hash are kept) so older links
work. The synthetic design prototype remains available for comparison.
Data stays in the browser. By default it lasts only for the current session.
Under Data, **Remember on this device** opts into an unencrypted local snapshot
of source labs, events, attributes, manual demographics and derivation settings,
and (since 2026-11-16) the analysis settings of the Trajectories page: the
shared and per-parameter fit settings, the selected parameters, Trend and
trend-line choices and the display options. Reopening restores the data
preparation and those settings.

Storage layout: the dataset copy and the analysis settings are two records in
the same database. The dataset record (`lab-explorer:workspace:v1`) holds the
data, its save time and a write token; the settings record
(`lab-explorer:workspace-settings:v1`) holds the analysis settings and the
write token of the dataset copy they belong to.

- **Expiry.** The dataset copy expires seven days after the last *data*
  change (labs, events, attributes, demographic edits, derivation settings,
  file name). Changing analysis settings writes only the settings record, and
  restoring a copy writes nothing at all, so neither extends the seven days.
- **Removal happens at start-up only.** Nothing removes an expired copy while
  the app is closed: expiry is checked when the app starts, and a copy is
  removed when more than seven days (604 800 000 ms) have passed since its
  save time; at exactly seven days it is still restored. Until the app is
  opened again the unencrypted copy stays on the device. The Data page shows
  both times in local time to the minute, for example "Saved on 2026-11-21
  14:05; removed when the app is next opened after 2026-11-28 14:05". The
  header keeps the short "Saved on this device".
- **When settings are written.** With every data change, and after that only
  when the user changes a setting. Opening the Trajectories page writes
  nothing: the view reaches the store only once it differs from what the page
  opened with. A stored settings record is therefore never replaced by
  defaults just because the page was opened, also not one saved by another
  settings version.
- **A copy without settings.** A dataset copy can be on the device without a
  settings record of its own (saved by a version before 2026-11-16, or moved
  over from the earlier shared database). The first settings change then
  writes the record, if the dataset copy is still this tab's.
- **A failed settings write** is reported next to the storage status, which
  keeps describing the dataset copy ("Saved on …"). It does not
  turn on the leave-page question and offers no "Retry saving", which would
  rewrite the dataset; the next successful settings write clears the
  message.
- **A failed data write** commits neither record.
- **Written together, removed together.** A data change writes both records in
  one transaction. Clearing the saved data, an expired copy and an unreadable
  copy remove both. Settings whose token is not that of the dataset copy are
  never applied; the copy then starts from the defaults.
- **Several tabs.** For data the rule is unchanged: a tab whose copy was
  replaced or removed by another tab stops saving and says so. It notices
  this with its own next data change, and also when it is shown or focused
  again (`visibilitychange`, window `focus`): it then compares the copy on
  the device with its own last write, without writing anything, so its
  status does not keep naming the save and removal time of a copy that is
  no longer there. While the tab stays in the background and unchanged, its
  status still describes its own last save. For analysis
  settings, two tabs on the same copy can both write and the last write wins;
  a tab whose dataset is no longer the saved copy does not write settings and
  shows no error for it.
- **Restore.** Each stored setting is checked against this version and the
  restored dataset; one that no longer fits (a removed option, a parameter
  that is not in the dataset) falls back to its default and is named in the
  restore notice. Module settings of a column are read over the current
  defaults: a module the stored settings lack keeps its defaults, and a
  stored entry of a module this version does not have, or that fails the
  module's validation, is left out and named. Repeated parameter keys are
  dropped. Choices for a computed eGFR parameter that the current
  derivation does not produce are kept without a notice and apply again when
  the derivation produces it. Settings saved under a preset whose definition
  has changed since keep their values and are shown as "Custom
  configuration"; the notice names them. The fits read those values, so no
  slope, endpoint or other result changes. What changes is the name: the
  page no longer shows the preset, the Cohort models page calls the data
  preparation "Edited settings", and the exported fit configuration gives
  `preset: custom` and `xAxis: calendar_time` instead of the preset's own
  (`xAxis` is recorded only; no calculation reads it). Which settings
  sections the editor shows follows the values, as for any custom
  configuration. Settings saved in another settings
  version are discarded as a whole; the dataset is kept and the notice says
  that the settings could not be used.

Sorting, grouping, patient selection, cohort model settings and fitted models
are not saved. Without the option, the browser asks before the page is
reloaded or closed while a dataset is loaded. It does not ask for the bundled
demo data as loaded, because they load again with one click. It asks once
events or attributes were imported on top of them, a patient's demographics
were edited or the eGFR derivation was changed (also when that change is
undone), and for any copy restored from this device. The copy is
kept in the app's own IndexedDB database (`lab-trajectory-explorer`), not in the
default database other apps on the same origin can share. An expired, invalid or
unsupported copy is removed at start-up. A still valid copy saved by the previous
release is moved over once. Data the former interface saved (its dataset and
settings) is removed at start-up regardless of age, and the Data page says so once.
**Clear saved data** removes the local copy while retaining the current session;
**Clear dataset** confirms and removes both. Storage errors remain visible and
imports still work. A stale tab cannot overwrite a newer or deleted snapshot;
its next save stops and explains how to resume or explicitly save its own data.

## Network access

Loading the app, importing, the Trajectories page, Methods and the exports
request nothing beyond the app's own address (the bundled demo and template
files included). The first cohort model fit of a session loads the R runtime
and R packages, which every build serves next to the app (since 2026-11-22):
22 requests and 38.7 MB on the demo data, GET and one HEAD, no request body,
all to the app's own address. Later fits of the session request nothing.
Before, the same files came from `webr.r-wasm.org` and `repo.r-wasm.org`.
The interface says so next to the fit button, in the message after a failed
load and under Methods, "Data & eGFR", "Network access and local storage".

The build adds a Content-Security-Policy meta element
(`src/build/contentSecurityPolicy.ts`): own address only (since
2026-11-22; before, also the two webR hosts for scripts and connections),
`data:` and `blob:` images, inline styles. It restricts the document, not the
model worker: a worker takes its policy from the response headers of its
script, and GitHub Pages sends none. A real fit ran in Chromium on
2026-11-22 with the policy and every other host blocked. The development
server page carries no policy.

## Starting a local copy

The build does not start from `file://`: Chromium blocks the module script
and the stylesheet (origin `null`); Firefox starts the app, but a model fit
fails there. `index.html` holds a static notice inside `#root` that the
started app replaces; it becomes visible after two seconds and stays when the
script does not load. Serve `dist/` through a web server (see the README).

The results table of the Cohort models page is part of the main bundle. The
page is rendered while hidden as soon as data are loaded, so a separately
fetched chunk failed whenever the connection was gone. An error boundary
around that page and one around the app show a message with "Retry" instead
of unmounting everything.
The application language is English;
imported parameter names and patient attributes retain their original values.

## First complete workflow

1. Under **Data**, import an XLSX/CSV file or load the supplied demo data.
   A workbook can contain `labs`, `attributes` and `events`. Downloadable templates
   show the core columns; all accepted headers and sheet names are listed in the
   [algorithm reference](method-algorithms/import-and-values.md#import-and-value-interpretation),
   and the demo workbook, events and attributes can be downloaded as examples; arbitrary column mapping is a later extension.
   Loaded events and rejected event rows are listed with their reason.
2. Review import diagnostics and missing or conflicting demographics. Manual age
   entries use the displayed reference date. Open a patient from the quality table.
   CSV files are read as text (UTF-8 or Windows-1252, comma or semicolon) and
   accept decimal commas; a text value of one to three digits, a point and
   exactly three digits (`0.850`, `1.234`) is read as a decimal and reported
   in the diagnostics, because the point could have been a thousands
   separator. Dates may be `YYYY-MM-DD`, `YYYY/MM/DD`, `DD.MM.YYYY` or
   `DD/MM/YYYY`; a slash date with the year last is always read day-first
   (month-first dates are not supported), and
   a time of day does not change the date (on lab dates it only orders the
   creatinine values of one day for AKI detection); Excel cells holding a date number (1927–2119 for lab
   and event dates) are converted. Rows with impossible or unreadable dates are
   rejected and listed. Diagnostics also count duplicate rows, censored values
   (`<`, `>`) and decimal commas that may be thousands separators, and list unit
   spellings merged because they differ only in spacing, micro sign or case that
   does not change an SI prefix.
3. Choose an eGFR formula and creatinine source (no formula is active until one
   is applied), inspect the preview, then apply.
   Source measurements remain intact. Output-name collisions with imported series
   block the derivation instead of silently combining measurements. Unreadable
   sex spellings are quoted until a manual entry or attribute resolves them.
4. Under **Trajectories**, select parameters by name and unit. Search or select
   patients and compare the graph table, individual view and spaghetti overlay.
   Different units remain separate. Horizontal column navigation accommodates many
   parameters; the patient table is paged (25, 50 or 100 patients per page,
   50 by default) while sorting and export keep the full scope.
   Metric sorts (latest value, slope, absolute slope, count, duration) can be
   reversed; patients without a value stay last. A sort by slope places
   uncertain slopes after the other slopes unless "Uncertain slopes last" is
   switched off. "Show only" filters by mark (including "Reliable slope": at
   least four fitted dates over at least two years) or event type.
5. Export the selected patient scope as XLSX, or download individual charts as
   SVG/PNG. Displayed metrics and exports reuse the same prepared analysis.

## Analysis and model workflows

- Individual analyses support OLS, Theil-Sen, rolling OLS, segmented OLS and no fit.
  Rolling and segmented OLS report the global OLS slope, R² and confidence
  bounds; segmented OLS adds per-segment lines, and rolling OLS adds one line per two-year window with
  the number of windows and their smallest and largest slope.
  Shared presets and per-column overrides include event censoring, AKI exclusion,
  time aggregation and rapid-decline settings. The table and exports use the same
  prepared summaries. Uncertain individual fits have dotted lines in the overlay
  and an accessible description, in addition to the overall warning count.
  Patient measurement rows explain existing event/AKI exclusions and identify
  values available before time aggregation; this does not introduce another fit.
  In the charts, measurements excluded from the fit are grey open circles whose
  tooltip names the reason. **AKI windows and episodes** (plot settings) shades
  the AKI window from each detected episode's onset for the column's window
  length (default 30 days, both ends included) and marks its creatinine peak
  ("AKI II"); in the overlay, episode diamonds appear for every trajectory,
  windows and labels for the highlighted patient only. A peak without a
  measurement of the charted parameter within two days is marked on the time
  axis. The model page lists the reference category of each categorical factor.
- Cohort model fitting actions share the existing full model validation. If no
  unit qualifies, the studio action is disabled and explains the
  validator's reason, including patient counts, distinct measurement times and
  factor/reference requirements. Trajectories No fit disables the action with
  guidance to choose a fit model there. Grouped fits show the eligible unit count,
  fit the pooled cohort and eligible groups, and identify skipped units beside
  the studio action. Changing outcomes or model settings updates availability
  immediately. The studio holds the only Fit model action; the preview card shows
  a short guidance line instead, and after a current fit the action reads
  "Refit model" without primary emphasis. With a grouping, the studio lists the
  patients each group contributes; when no group reaches the minimum, it says
  so before fitting and the action reads "Fit whole cohort only".
- Cohort models fit linear mixed models in the browser (webR, `lme4::lmer`,
  REML) with configurable factors, grouped fits, result tables and
  profile/threshold projections. Chart results must match the current response,
  unit, data, preparation and model configuration, must have converged and must
  not be singular. Changing response or data hides stale
  curves. Overlay filters do not refit or redefine the full-cohort reference line.
  On an age axis, the reference uses mean fitted baseline age plus model time;
  the line is not drawn on the calendar axis.
  When the overlay is grouped by the attribute the groups were fitted under, each
  fitted group also gets its own reference line in the group colour. The model
  page shows a readable formula and lists patients a factor choice excludes.
- The model preview exports SVG/PNG. Individual views also export a ZIP containing
  the scoped patient workbook and currently available SVG charts, with metadata
  and research framing. Distinct charts retain distinct names in the archive.

## Scope boundaries

- Stored data preparation is not full project management: named projects, saved
  view/column configurations and saved fitted models are not included.
- Owner-approved G4/G5, confirmed-decline and kidney-failure definitions,
  fitted-curve individual prediction and Theil-Sen conventions are documented in
  the [algorithm reference](method-algorithms.md). Endpoints use dated exact
  numeric eGFR measurements before the first kidney transplant or chronic
  dialysis start and outside complete dated acute dialysis intervals,
  independently of optional display-fit preparation. The minimum confirmation
  interval is configurable (default 90 days) with a 12-calendar-month maximum;
  recovery after confirmation remains visible without revoking the event.
- Research use only; no clinical decision support or event-time model.

The current worklist is the [completion backlog](workspace-completion-backlog.md).
Historical requirements are tracked in the
[requirements reconciliation](requirements-reconciliation.md) and
[feature inventory](../prototypes/analysis-workspace/feature-audit.md).

## Acceptance record

Approved-method implementation verified 2026-09-23: 873 unit/component tests in
101 files passed, production build passed, and the full production browser suite
passed 78 checks across Chromium, Firefox and WebKit without retries. Tests
include configurable confirmation, retained recovery evidence, fitted-curve raw
prediction, Theil-Sen reference bounds and actual workbook provenance. Three
independent review findings were reproduced and fixed before the final checks.
See [method algorithms](method-algorithms.md) for the intentional numerical changes.
After the final endpoint-text width adjustment, production build and the endpoint
workflow passed again on all three browsers, including the 390px layout check.
The following records precede this method update.

Verified 2026-09-23:

- `pnpm test --maxWorkers=2 --minWorkers=1`: 857 tests across 100 files passed.
- `pnpm build`: TypeScript and production bundling passed.
- With `CI=1` and `CROSS_BROWSER=1`, the complete Playwright suite passed
  72 checks in Chromium, Firefox and WebKit. After adding per-measurement
  exclusion explanations, all 36 workspace checks passed again against the
  final production build (`--workers=2 --timeout=60000 --retries=0`).
- Browser coverage includes prepared-data resumption/deletion, stale-tab storage,
  failed replacement, actual SVG/PNG/ZIP/workbook downloads, event exclusions,
  narrow screens and a synthetic 200-patient/19,200-measurement cohort.
  A real WebR demo fit was also exercised separately.
- Independent code review reproduced and resolved stale-tab persistence and
  clear/import races. Numerical core files and parity contracts are unchanged.

These checks establish technical regression coverage. Representative research
data, first-user acceptance and the decisions in the
[current backlog](workspace-completion-backlog.md) remain outstanding.
The dated records below describe earlier checkpoints.

Verified 2026-09-14 before the English-language correction:

- 814 unit/component tests across 97 files passed. The final keyboard-focus patch
  was additionally verified by all 11 trajectory component tests.
- Production build passed with both application entry points.
- All 13 existing browser regression checks and all 3 new workspace checks passed
  against the production build (across two runs).
- Real generated XLSX: string patient IDs, 12 imported parameters, identical names
  with distinct units, missing demographics, valid/rejected events and derivation.
- Failed replacement preserved loaded data; successful replacement reset scope.
  Manual demographics updated calculated rows; formula replacement retained the
  selected derived trajectory; disabling derivation explained its unavailability.
- Actual downloaded workbook contents, UTC dates in an America/Los_Angeles browser,
  patient/parameter scope, derived provenance, SVG content and PNG bytes checked.
- A 390 px viewport stayed within the page width. Horizontal table position and
  keyboard focus survived patient-detail navigation.
- Desktop graph table, grouped overlay and downloaded PNG inspected visually;
  chart title, axis/unit, grouping context, legend and research footer were present.
- Independent package and whole-change reviews completed; substantive findings
  were fixed and re-reviewed. Numerical core was not changed.

Final English-language verification, 2026-09-14:

- 814 tests across 97 files passed; production build passed.
- All 16 Chromium checks passed in one run against the production build, including
  the three complete workspace workflows and actual workbook/SVG/PNG downloads.
- Independent review found no missed German application copy or translation
  regressions. Imported labels and core field names remain untouched; workspace
  exports present English column headers through a local adapter.
- Downloaded English PNG visually checked: title, grouping, axes and research
  footer readable. Local workspace remains available on port 5173.
- Implementation and translation packages were committed incrementally. English
  application copy and regular commit checkpoints are recorded in `CLAUDE.md`.

Technical verification does not replace acceptance with representative research
files or release approval. Nothing from this branch has been released.

## Visual review follow-up

The external preview review identified misleading automatic value-axis zoom,
an unstyled active view switch, an overly broad methods page, an inconspicuous
new derivation, dense controls, unresolved sex codes and inconspicuous event lines.
These were checked against the implementation rather than treated as clinical
recommendations.

- Value scales default to the full dataset range for each parameter and unit,
  including zero and negative values where present. The same scale is used in
  the graph table, overlay and individual view. Users can explicitly choose
  **Zoom to visible values** to inspect small changes. This is a display choice,
  not a clinical reference range; the chosen scale is included in chart exports.
- Table, Overlay and Individual patient have a visibly selected button.
- Methods now opens a short workflow guide and nine topic pages, with a desktop
  sidebar and a collapsible mobile menu. Scientific reference content and
  examples remain available within their topics; calculation details can be
  expanded or opened directly through section links. URLs such as
  `#methods/aki/timing` survive reload and browser history navigation.
  Contextual links from eGFR, analysis settings, endpoint details and cohort
  models open the relevant topic while retaining the mounted workspace state.
  Sticky mobile controls and explicit return actions connect reading back to
  analysis. Calculation groups expand individually; reference tables retain
  readable columns inside named, keyboard-accessible scroll regions.
- Newly created derived parameters are added to the current selection with a
  notice. Imported parameters remain selected; deliberate deselection is respected.
- Derived-value preview scrolling is bounded and Apply stays above it. Sex codes
  are translated only for presentation; source values and grouping identities are
  retained. Plot copy and analysis controls are made more compact, and plotted
  events can be inspected by patient, date and title.

The broader first-time-user orientation and full analysis configuration remain
in the existing requirements inventory. Technical preview acceptance does not
establish clinical significance or replace testing with representative data.

Final follow-up verification, 2026-09-14: 821 tests across 97 files passed,
production build passed, and all 17 Chromium checks passed against that build.
The added browser regression verifies computed-series visibility, contrasting
active-view styles, identical shared scale in overlay and patient detail,
explicit zoom and the methods disclosure. Independent review completed with no
substantive issues remaining; the numerical core is unchanged.
