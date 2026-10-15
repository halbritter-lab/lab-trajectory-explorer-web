# Trajectory toolbar preview

Open `/prototypes/trajectory-toolbar/index.html` with the existing Vite dev server.
This is an interactive layout proposal, excluded from the production entry point.

The preview automatically loads the bundled synthetic demo dataset in its own
page session. It does not start workspace persistence. Measurements, fits,
filtering and exports reuse the existing application functions. The copied
`TrajectoriesPreview.tsx` is a disposable presentation fork of
`src/workspace/TrajectoriesWorkspace.tsx`; it is not a second maintained product UI.

Try patient search, Parameters, Filter, Sort and View. Analysis opens a nonmodal
desktop panel and a modal full-screen editor on mobile. Presets and per-parameter
overrides recalculate the demo trajectories. Escape closes panels and menus.
The top link opens the current application for comparison.

The default table presentation is Minimal with small charts: latest value,
measurement count and, when analysis is enabled, the slope. Measurement details and warning
explanations open on hover, keyboard focus or tap, with Escape/outside dismissal.
AKI always retains its short pill label; other indicators can use icons or text
badges under View → Warnings. Compact and Full details remain available.

The quiet analysis panel initially shows Scope, Preset and the scope note.
Shared defaults offer general presets only. Nephrology profiles require an
explicit parameter scope and create independent settings. This is manual
assignment, not automatic clinical eligibility validation. eGFR-specific endpoint
controls use the existing unit recognition rule.

Trend analysis activation is separate from line visibility: enabling analysis
allows the configured fit and slope for that parameter; disabling it uses the
existing `fitModel: none` calculation path and removes its fit and slope results.
View → Show trend lines affects only the graph and retains calculated results.
Selecting a No fit method deactivates the affected trend analyses. The preview
uses the existing numeric core; production behavior is unchanged.

Automatic suggestions are intentionally not implemented. Any future proposal
needs explicit rules for analyte identity, units, specimen/source, computed versus
imported values, ambiguous columns and user confirmation before assignment.

Preview navigation back to Data or Cohort models opens the current application;
it does not create new preview versions of those workspaces.

Verification: prototype TypeScript check; regression tests for shared preset
scope and actual slope/fit activation; browser checks at 1440×1000 and
390×844 for filtering, search, scale/detail controls, preset changes, desktop
panel and mobile modal dismissal. No page errors or horizontal page overflow
observed. The first desktop chart starts around 469px; mobile around 592px.
Browser checks also verify that hiding lines retains slopes, disabling analysis
removes slopes, and an eGFR profile assignment leaves other parameter settings
and shared defaults unchanged.
