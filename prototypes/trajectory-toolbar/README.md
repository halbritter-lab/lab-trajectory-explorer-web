# Trajectory toolbar preview

Open `/prototypes/trajectory-toolbar/index.html` with the existing Vite dev server.
This interactive proposal is excluded from the production entry point. It loads
bundled synthetic demo data in its own page session without workspace persistence.
Measurements, fits, filters and exports reuse existing application functions.
`TrajectoriesPreview.tsx` is a disposable presentation fork, not a second product UI.

Search and parameter selection sit above the table. S/M/L directly
changes chart size; value scale remains a separate Display option. S keeps point
markers so single measurements and bounded values remain visible. Column titles
sort latest values; the ellipsis, right-click or Shift+F10 opens explicit sort
metrics and directions. Menus support arrow keys, Home/End, Escape and outside
or focus-leave dismissal. The sticky ID column has the same sorting controls.

Attributes independently toggles ordinary metadata columns after ID. Multiple
attributes can be visible without grouping or changing patient order. Each has
an entirely clickable selection row, including its name and surrounding space.
Native label activation preserves the open picker while toggling the checkbox.
Each column has
header-click and context-menu sorting; text categories use natural ordering and
missing values remain last in both directions. Hiding a sorted attribute keeps
the sort, with a visible clear-sort chip. Grouping remains a separate operation
in each attribute column's context menu; there is no toolbar Group by selector.

The column menu's Group by this column action creates sections with patient counts instead of repeating
the category under each ID. Sections collapse with a click or keyboard activation;
page selection includes only expanded rows. Column sorting applies within each
group, and the separate Show selector filters to one group. Missing attributes
form a final Not recorded section. Groups spanning pages repeat their header with
the page count and total matching count. Collapse affects presentation only;
filters still define the analysis and export scope, and exports retain raw
category values. The same attribute still controls Overlay colors.
An active grouping has a removable chip, including when its column is hidden.
Removing or changing grouping clears its old group filter and collapsed state.

The parameter picker separates title, search, bulk selection, scrollable options
and Apply/Cancel controls. Options wrap long labels and keep 44px targets. On
short landscape screens the complete dialog scrolls so controls remain reachable.

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
Grouping checks additionally cover within-group sorting, keyboard collapse,
visible-only page selection, group filtering, category values in the downloaded
workbook, and 112 patients across three pages. Attribute checks cover multiple
columns without reordering, ascending/descending and keyboard context menus,
missing values, hidden-sort preservation, grouping independence, compact column
widths, mobile selection and absence of implicit grouping in XLSX exports.
Column-based grouping and parameter-picker search, Apply/Cancel, Escape and
non-overlapping layouts are verified at 1440×1000, 390×844 and 844×390.
All 925 unit tests pass.

The independent critique of the preceding layout is archived under
`.impeccable/critique/2026-10-15T15-04-24Z__rajectory-toolbar-trajectoriespreview-tsx-3ff5f695.md`.
