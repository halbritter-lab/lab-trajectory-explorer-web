# Trajectory toolbar preview

Open `/prototypes/trajectory-toolbar/index.html` with the existing Vite dev server.
This interactive proposal is excluded from the production entry point. It loads
bundled synthetic demo data in its own page session without workspace persistence.
Measurements, fits, filters and exports reuse existing application functions.
`TrajectoriesPreview.tsx` is a disposable presentation fork, not a second product UI.

Search, parameter selection and grouping sit above the table. S/M/L directly
changes chart size; value scale remains a separate Display option. S keeps point
markers so single measurements and bounded values remain visible. Column titles
sort latest values; the ellipsis, right-click or Shift+F10 opens explicit sort
metrics and directions. Menus support arrow keys, Home/End, Escape and outside
or focus-leave dismissal. The sticky ID column has the same sorting controls.

Each parameter has direct Trend activation, method selection, a line visibility
toggle and contextual settings. These controls also appear beside plots in Overlay
and Individual patient views. Enabling analysis calculates fits and slopes;
hiding lines retains the results. Disabling analysis uses the existing no-fit
calculation path. Selecting No fit also removes obsolete slope sorting.

Minimal cells show latest value, count and any calculated slope. Explanations
open through icon tooltips on hover, focus or tap. AKI retains its short pill.
Display offers warning text badges and Compact/Full cell details when needed.

General defaults offer general presets only. Specialist profiles are assigned
explicitly per parameter and create independent settings. No automatic clinical
eligibility is implied. The shared editor renders generic module descriptors
through registry applicability rules; domain-specific settings live in optional
UI adapters in `analysis-modules.tsx`. Nephrology is one adapter. The numerical
core and production interface are unchanged.

Automatic profile suggestions are intentionally deferred until analyte identity,
units, specimen/source, computed versus imported values, ambiguous columns and
confirmation rules are defined. Preview navigation to Data or Cohort models
opens the current application.

Verification: prototype TypeScript check, three focused regression tests and
production build. Browser checks at 1440×1000 and 390×844 cover calculation versus
line visibility, independent profile assignment, contextual settings in all three
views, sort directions, mouse/keyboard context menus, S/M/L, point visibility,
no-fit sort reset and bounded mobile menus. No page errors or horizontal page
overflow were observed. Measured interactions: Trend 3 → 1 click; Trend plus line
6 → 2 clicks (compared with the preceding preview, including panel dismissal).

The independent critique of the preceding layout is archived under
`.impeccable/critique/2026-10-15T15-04-24Z__rajectory-toolbar-trajectoriespreview-tsx-3ff5f695.md`.
