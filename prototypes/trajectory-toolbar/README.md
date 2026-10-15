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
measurement count and, when shown, the slope. Measurement details and warning
explanations open on hover, keyboard focus or tap, with Escape/outside dismissal.
AKI always retains its short pill label; other indicators can use icons or text
badges under View → Warnings. Compact and Full details remain available.

The quiet analysis panel initially shows only Scope, Preset and the scope note.
Preset explanation, calculation settings and per-parameter trend visibility are
separate disclosures. This changes presentation only, not computation rules.

Preview navigation back to Data or Cohort models opens the current application;
it does not create new preview versions of those workspaces.

Verification: prototype TypeScript check; browser checks at 1440×1000 and
390×844 for filtering, search, scale/detail controls, preset changes, desktop
panel and mobile modal dismissal. No page errors or horizontal page overflow
observed. The first desktop chart starts around 469px; mobile around 592px.
