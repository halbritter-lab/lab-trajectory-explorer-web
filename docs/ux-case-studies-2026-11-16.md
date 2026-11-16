# Simulated-user case studies (2026-11-16)

Four scripted walkthroughs of the workspace by simulated first-time users. This
file records what they did, what they saw and where they went wrong. It changes
no code and decides nothing: prioritisation is the owner's and is tracked in
issue #2.

**These are simulated users, not user testing.** Software agents played the
user. The results show where the interface can mislead a newcomer; they do not
show how real people behave, and they do not replace the first-time human
tester run in [research acceptance](research-acceptance.md).

## 1. Method

- **Build.** Production build of `main` at `8dd4d6a` (package version 0.3.7 plus
  the unreleased changes), served locally, one server per case.
- **Browser.** Chromium, driven by scripts, with a screenshot after every step
  that was read before the next step was chosen. Main viewport 1440×900; one
  further viewport per case (A, B and D: 1280×720; C: 390×844).
- **Persona.** A clinician-scientist in nephrology. Comfortable with Excel, not
  with statistics software. Has never seen the tool and has not read its
  documentation. Reads English as a second language. Has 30 to 45 minutes.
- **Rules.** Decide each step only from what the screen shows. When stuck after
  a few attempts, note that a real user would be stuck, then use the in-app
  Methods pages or the source code and say so. No case read the source code;
  cases A, B and D used the in-app Methods pages.
- **Cases.**
  - A: own data for the first time (templates, a self-made German-style lab
    export with deliberate mistakes, upload, eGFR, slopes, export).
  - B: CKD progression in the demo cohort (fastest decliners, unreliable
    slopes, G5 projection, observed endpoints, presets, export, help).
  - C: acute kidney injury and clinical events in the demo data (episodes,
    exclusion from the slope, dialysis and transplant, overlay, reload).
  - D: do two groups differ in their eGFR decline (attributes, grouping, cohort
    model with a factor, reading the result, projection, R export).

### Limits

- Agents, not people: they read every screenshot completely and do not tire.
  Real users will miss more.
- Native hover tooltips do not render in headless screenshots. Tooltip texts
  were read from the page, not seen on hover. Whether a leave-page warning
  appears on reload could not be observed.
- One collision: for about five minutes one run drove another run's browser
  (shared debugging port). The affected run (case A) restarted in a private
  browser with clean storage and repeated every step; nothing in its results
  comes from the contaminated session. Case B's browser was closed once from
  outside near the end; it rebuilt its state for the 1280×720 screenshots.
- Screenshots, test files and exported workbooks are kept locally and are not
  in the repository.
- Not opened or not done:
  - A: overlay, cohort models, event and attribute uploads, the mobile layout,
    a semicolon CSV saved by German Excel in ANSI encoding (the test file was
    UTF-8 with BOM).
  - B: cohort models, the ZIP bundle, "General defaults".
  - C: no cohort model was fitted; "Segmented OLS" and "Rolling OLS" were not
    tried.
  - D: the exported R script was read but not run in R; PNG/SVG downloads and
    the "Demographic adjustment" tab were not opened. webR loaded: the first
    fit of three models took about 3.5 minutes (not timed exactly), later fits
    about 1.5 seconds.
- Some quoted texts were already being changed in open pull requests when the
  build was tested (methodology wording drafts, the endpoint hint in the
  analysis settings, a hint next to the demo download). The findings quote the
  build as tested.

## 2. Results per case

### Case A: my own data for the first time

All seven goals were reached without reading source code, but two results the
app showed as trustworthy were not (see UX-18 and UX-19).

| # | Goal | Result | Attempts |
| --- | --- | --- | --- |
| 1 | Start page | Reached. Nothing on the page says the tool computes eGFR or slopes. | 1 |
| 2 | Templates | Reached with help: the lab template is a header row only, so the demo workbook was opened to see formats. | 2 |
| 3 | Prepare dataset | Reached. The `birthDate` column name was a guess; it worked. | 1 |
| 4 | Upload and fix | Reached. The header error was clear. The second fix (test name) was found only by noticing an empty eGFR cell. | 3 uploads |
| 5 | eGFR | Reached with help (in-app Methods link). | 1 |
| 6 | Slopes and badges | Reached, with wrong-conclusion risks. | 1 for the slope, 3 controls for a trend line |
| 7 | Export | Reached. Slope, unit, model, n and n_fitted are all there; warnings are spread over five columns. | 1 |

### Case B: CKD progression in a cohort

All nine goals were reached, three of them only with help from the in-app
Methods page.

| # | Goal | Result | Attempts |
| --- | --- | --- | --- |
| 1 | Load demo, understand it | Reached | 1 |
| 2 | Three fastest decliners | Reached, but the answer depends on the preset | 3 |
| 3 | Unreliable slopes and the rule | Reached with help (the rule is only in Methods) | 3 |
| 4 | G5 projection and why it is missing | Reached with help | 4 |
| 5 | G4/G5 reached, 40 % decline | Reached; one near-miss on patient 26 | 2 |
| 6 | Patient view, overlay, way back | Partly: way back yes, line identity no | 3 |
| 7 | Presets | Reached; switching has side effects | 2 |
| 8 | Exports | Reached; method naming is weak | 1 each |
| 9 | Projected-age explanation | Found in 2–3 clicks; only partly understandable | 1 |

What the user believed each badge meant, against the in-app help:

| Badge | Believed | Help says |
| --- | --- | --- |
| Red triangle | Unreliable value | "Rapid decline: slope < -5 /year" (wrong) |
| Amber triangle | Some warning | Uncertain slope (right) |
| Flag | Kidney failure | Any endpoint information; on every row under the CKD preset (wrong) |
| "-31%" | Percent per year | "Total eGFR change … (not per year)" (wrong) |
| "G5 not projected" | Will not reach G5 | Crossing more than 20 years away, or interval includes zero, or flat or rising (wrong) |
| "G5 not projected after KRT" | Unclear | Already on dialysis or transplanted |
| "G5 no fit" | Bad data | The Trend checkbox is off (wrong) |
| ⊘ | Unknown | "Excluded measurements" |
| "—" (patients 3, 5, 10) | No eGFR | Right |

### Case C: acute kidney injury and clinical events

| # | Goal | Result | Attempts |
| --- | --- | --- | --- |
| 1 | Load demo including events | Reached: "506 lab values, 8 events and 26 attribute rows loaded." | 1 |
| 2 | Who had AKI, when, how severe | Partly. Stage: yes (badge "AKI II", "1 AKI episode: 1× stage II"). Date: only by reading the plot or a hover tooltip on the red diamond. No list of AKI episodes on screen or in the exports. | 5 |
| 3 | Leave AKI out of the slope | Reached. Patient 6 before: "OLS: -6.2 ml/min/1,73m²/year, R² 0.06", "11 fitted measurements"; after: "-9.25 …, R² 0.99", "7 fitted of 11 measurements", "3 excluded from the fit (AKI window)". Excluded rows are named in the measurement list ("Excluded: AKI window"). | 3 |
| 4 | Values after dialysis or transplant | Reached, but only under the CKD preset ("Excluded: after kidney transplant"). | 2 |
| 5 | Overlay: date, age, trend lines, AKI and events | Partly. Colour or group by attribute does not exist in the overlay; a real user would be stuck here. | 4 |
| 6 | Acute view and back | Reached, but it is not clear what changed. | 2 |
| 7 | Get lost in Methods and return | Reached. Tab, axis, highlight and preset were intact; the settings panel was closed and the scroll position reset. | 1 |
| 8 | Reload | First try: everything gone ("No data loaded yet"). Second try with "Remember on this device": data kept, but preset, trend and display were reset. | 2 |
| 9 | Export plot and cohort table | Partly. PNG/SVG show the AKI marker and window. The cohort workbook has only an `aki` column ("AKI II"). | 1 |

### Case D: do two groups differ in their eGFR decline?

| # | Goal | Result | Attempts |
| --- | --- | --- | --- |
| 1 | Load demo, understand attributes | Reached, but not on the Data page | 3 screens |
| 2 | Attribute column, sort or group | Reached | 2 |
| 3 | Descriptive comparison | Reached in part: no per-group summary | 2 |
| 4 | What the cohort model does | Reached with help (in-app Methods link) | 2 |
| 5 | Fit difference model and adjusted model | Reached | 2, then 1 |
| 6 | Read the result | Reached in part: no p-value guidance, no methods text | 1 |
| 7 | Who was left out | Reached in part: 1 of 3 patients explained | 2 |
| 8 | Projection | Reached | 1 |
| 9 | Export for R | Reached | 1 |
| 10 | Stale-result notice | The result is discarded, with no notice | 1 |

At 1280×720 the model page showed no layout problem.

## 3. Consolidated findings

One row per finding, merged across cases. **Severity** is the one the case
reported (blocker, major or minor); where cases disagree the higher one is
taken and the disagreement is noted. "Not rated" marks wrong-conclusion risks
and goal notes that a case reported without a severity. No case reported a
blocker. **Kind** is the main kind:

- (a) wrong-conclusion risk
- (b) cannot find or cannot do
- (c) wording
- (d) export
- (e) possible defect to verify (also listed in section 4)

### Start and templates

| ID | Finding | Cases | Severity | Kind |
| --- | --- | --- | --- | --- |
| UX-01 | The start page does not say that the tool computes eGFR or slopes. It says only "Import lab values, review patient details and inspect calculations." | A | minor | (c) |
| UX-02 | The lab template is a header row and nothing else: `patientId,labDate,testName,unit,value,loinc,sex,ageAtLab`. No example row, no date or decimal format, no allowed sex values. A birth date is not mentioned. | A | major | (b) |

### Import and data page

| ID | Finding | Cases | Severity | Kind |
| --- | --- | --- | --- | --- |
| UX-03 | The Data page counts parameters but does not list them: "3 Parameter–unit combinations" (A), "28 patients, 506 imported values, 10 Parameter–unit combinations, 8 events" (B). In case A the user was not told that "Kreatinin i.S." and "Kreatinin" had become two parameters. | A, B | major | (b) |
| UX-04 | An import warning is hidden behind "1 import diagnostics — show details". Its text: "Sheet1, warning: Kreatinin [mg/dl]: 1 censored value (1 "<"); retained for display and raw counts, excluded from fits, endpoints and AKI detection." The file was a CSV, not a sheet. | A | minor | (b) |
| UX-05 | With a value typed as "<0,3" in the file, the page reports "0 values without a numeric measurement". | A | minor | (e) |
| UX-06 | Dates in DD.MM.YYYY were read correctly (03.04.2021 became 2021-04-03) without any confirmation of the format that was assumed. | A | minor | (b) |
| UX-07 | "4: Sex missing or unresolved" does not say whether this is patient 4 or four values. | C | minor | (c) |
| UX-08 | After loading attributes the page says only "506 lab values, 8 events and 26 attribute rows loaded." There is a "Loaded events (8)" list but none for attributes. Attribute names appear only under Trajectories → "Attributes"; patient counts per level only after grouping. | D | major | (b) |

### eGFR derivation

| ID | Finding | Cases | Severity | Kind |
| --- | --- | --- | --- | --- |
| UX-09 | The demo already holds imported eGFR, but the Data page says "3. Derive eGFR … Active: Off, 0 computed values" (B) and "eGFR formula: Off" (D), which suggests there is none. Deriving "CKD-EPI 2021" adds another eGFR column with different values (patient 1: 87.33 against 67.9). The model selector then offers four series: "eGFR", "eGFR (CKD-EPI)", "eGFR (CKD-EPI 2021)", "eGFR (CKD-EPI 2021, computed)". | B, C, D | major | (a) |
| UX-10 | "32 source values, 0 cannot be computed" although 38 creatinine values were uploaded. One patient's five values under another test name and one row in µmol/l were left out without a message. One patient then shows R² 1 with a point missing. | A | major | (e) |
| UX-11 | The help says "Values recorded in µmol/l are converted automatically (÷ 88.42)". The µmol/l row stayed a separate column "Kreatinin [µmol/l]" and that patient's eGFR has n=6, not 7. | A | major | (e) |
| UX-12 | The help describes three formulas; "CKD-EPI 2009 (race-free)" in the selector is not described. Nothing advises which formula to choose. The formula resets to "Off" after a re-upload. | A | minor | (b) |

### Trajectories table

| ID | Finding | Cases | Severity | Kind |
| --- | --- | --- | --- | --- |
| UX-13 | No slope is shown until the "Trend" checkbox is ticked; the cell shows only a value and a count ("87.33 n=10"). The purpose of the checkbox is not labelled. | A, B, C | major | (b) |
| UX-14 | The slope has no unit in the cell: "-6.54/yr", "-16.53/yr". The unit "ml/min/1,73m²/year" is only in the tooltip or behind the ⓘ click. | A, B, D | major (A: major; B: minor) | (b) |
| UX-15 | Badges are icons only (triangles, flag, crossed circle), with their meaning on hover only and no legend. Text badges exist only via Display → "Warning display: Text badges" and "Cell details: Full details". At 1440 px the fourth column is clipped. | A, B, C | major (A, B: major; C: minor) | (b) |
| UX-16 | The red triangle means "Rapid decline: slope < -5 /year". It has the same shape as the amber uncertain-slope triangle and was read as "unreliable value", so those slopes would be ignored. | B | major | (a) |
| UX-17 | The rapid-decline mark appears on slopes that the app itself calls uncertain or that are visibly weak. Two values: "-6.24/yr", "R² 1" and red "rapid ↓" next to amber "n < 3, uncertain slope"; the export has `rapid_progression = yes` (A). "rapid ↓" with R² 0.06 and interval [-25.08, 12.68] (C). Five points around a four-year gap give R² 0.99 and "rapid ↓"; the gap is not flagged (A). | A, C | not rated | (a) |
| UX-18 | A slope with a very wide interval carries no mark. Acute spike: -3.39/yr (CKD preset: -2.98/yr), R² 0.03, "95% slope CI [-21.49, 18.06]" (upper bound 15.54 under the CKD preset), no badge, `unstable_slope` and `aki` empty in the export, and the exported plot says "0 uncertain individual OLS fits" (A). Patient 7 on the default preset: interval [−26.01, −0.72], R² 0.29, not marked (B). | A, B | not rated | (a) |
| UX-19 | The count next to the slope is the raw count, not the fitted one. "n=11 -9.25/yr" for a slope fitted on 7 points; "Full details" is hidden under Display → Cell details (C). "n=10 -10.55/yr" with R² 1, but only two points were fitted (B). After excluding 3 of 11 values the page says "7 fitted of 11 measurements", not 8; the remaining rows all say "Available before time aggregation" (C). | B, C | major | (a) |
| UX-20 | Under the default preset, slopes run across AKI, dialysis and transplant with no warning. Patient 13: "OLS: 2.58 ml/min/1,73m²/year", "9 fitted measurements"; the only hint is the badge "Kidney failure reached (kidney transplant, 2022-07-01)". Patient 14: +34.18/yr (C), +25.29/yr (B). The three fastest decliners change with the preset: default 4, 7, 26; "CKD progression" 4, 13, 12; Theil–Sen 4, 7, 24 (B). Values after transplant are excluded only under the CKD preset ("Excluded: after kidney transplant"). | B, C | major | (a) |
| UX-21 | There is no "exclude AKI" control under the default preset: "Calculation settings" shows only Model and Aggregation. The checkbox appears only after choosing "CKD progression (quarterly medians, censoring, AKI exclusion)", which also switches to quarterly medians and censoring. The user attributes the whole slope change to AKI exclusion. The preset name is cut off in the selector ("CKD progression (quarterly medians, censoring, AKI e…" at 1280 px). | A, B, C | major | (b) |
| UX-22 | With the CKD preset the user believes an acute spike was excluded. It stayed in the fit; "7 fitted of 8" is only the quarterly median. Nothing says that no AKI was detected. | A | major | (a) |
| UX-23 | Switching presets has side effects. "Acute review" unticks Trend and drops the sort; the Trend box is disabled without explanation. Switching back to the CKD preset leaves Trend and the line off and shows "G5 no fit" for everyone. The Theil–Sen preset removes all endpoint badges without saying so. | B, C | major | (e) |
| UX-24 | The active preset and method are hard to see. The column header shows the "OLS" select and small "CKD progression · Own settings"; quarterly medians are not named. The overlay and patient views show no preset name. | B, C | major (C: major; B: minor) | (b) |
| UX-25 | Two eGFR columns can carry different presets: patient 6 shows -9.25/yr and -6.2/yr in the same row. | C | not rated | (a) |
| UX-26 | After a settings change the previous slope is gone; before and after cannot be compared side by side. | C | minor | (b) |
| UX-27 | The settings panel reflows the page; the plot being configured goes off screen. | C | minor | (b) |
| UX-28 | At 1280×720 one or two patient rows are visible above the fold. | A, B | minor | (b) |
| UX-29 | Grouping by an attribute is behind "…" → "Group by this column"; the popover says "Show columns without changing patient order." The group header then shows only "MUC1 6 patients", with no slope summary per group. | D | major | (b) |

### Patient view and overlay

| ID | Finding | Cases | Severity | Kind |
| --- | --- | --- | --- | --- |
| UX-30 | Ticking "Trend" prints numbers but draws no line. The line needs a second control, the eye icon "Show trend line". In the overlay no lines were visible after ticking Trend. | A, C, D | major (C: major; A, D: minor) | (b) |
| UX-31 | In the overlay all patients have the same colour, with no legend and no highlight on hover; the patient name is only a native tooltip. Event lines carry no label and the event list is in no order. | B, C | major | (b) |
| UX-32 | The overlay says "Inspect events (7)" although 8 events were loaded. | C | major | (e) |
| UX-33 | The overlay cannot colour or group by an attribute. That exists only under Cohort models, "Subgroup comparison". | C, D | not rated | (b) |
| UX-34 | "Shared parameter scale" runs 0–161.2, set by a ">161.2" eGFR of another patient that was derived from a "<0,3" creatinine. That value appears as a normal point (hollow dot). | A | minor | (a) |
| UX-35 | A patient without values of one parameter gets "Shared parameter scale; 1 without numeric measurements" and "No trajectories can be plotted. Check measurements, ages, or visible groups." | A | minor | (c) |
| UX-36 | A transplant is not marked on the patient chart; it is only listed under "Events for this patient". The fit line is dashed in the same colour and hidden under the data. | B | minor | (b) |
| UX-37 | On the age axis the highlighted patient is a narrow sliver and the "AKI I/II/III" labels overlap. | C | minor | (b) |
| UX-38 | At 390×844 the axis and "AKI II" text are illegible, and hover tooltips cannot be reached on touch. | C | minor | (b) |
| UX-39 | Two date formats on the same card: "01/07/2022" and "2022-07-01". | C | minor | (c) |

### AKI and events

| ID | Finding | Cases | Severity | Kind |
| --- | --- | --- | --- | --- |
| UX-40 | The AKI badge gives the stage but no date: "1 AKI episode: 1× stage II". "Measurement details" shows only "11 measurements · Latest 10/09/2023". The date can only be read off the plot or a hover tooltip. | C | major | (b) |
| UX-41 | AKI markers are off by default, under Display → "AKI windows and episodes". In the Table view the Display panel has no such option. | C | major | (b) |
| UX-42 | There is no list of AKI episodes for the cohort and no sort or filter by AKI in "Column actions". | C | major | (b) |
| UX-43 | The AKI date is taken from the creatinine peak marker, while the exclusion window starts at onset. | C | not rated | (a) |

### Endpoints and projection badges

| ID | Finding | Cases | Severity | Kind |
| --- | --- | --- | --- | --- |
| UX-44 | Badge texts are misread (see the table in section 2, case B). "G5 not projected" is read as "will not progress", "-31%" as a yearly rate, the flag as kidney failure, "G5 no fit" as bad data. | B | major | (a) |
| UX-45 | The projection has no column and no sort. It sits inside a flag icon, per row, and only under the CKD preset: 25 clicks to read the cohort. | B | major | (b) |
| UX-46 | A projected age reads as a prognosis: "-45%, 40% decline, G5 @ ~62y", "G5 @ ~75y". The caveats are in the tooltip only. | A, B, C | not rated | (a) |
| UX-47 | Patient 26 shows "-41%, G5 @ ~65y" with no "40% decline" badge and no reason. The user would report a 40 % loss. | B | major | (e) |
| UX-48 | The preset text says the G5 projection leaves out AKI windows; the Methods page says "Display-fit AKI exclusions and aggregation do not affect this endpoint prediction". | B | not rated | (a) |
| UX-49 | The explanation of the projected age is found in 2–3 clicks but is only partly understandable ("scalar endpoint prediction", "finite ordered bounds strictly below zero"). | B | not rated | (c) |

### Cohort models

| ID | Finding | Cases | Severity | Kind |
| --- | --- | --- | --- | --- |
| UX-50 | Nothing on the page says what the model is for. There is only "Overall progression rate without covariates." and a link. | D | major | (b) |
| UX-51 | "Subgroup comparison" comes first and fits separate models (A −5.29, B −8.18), with no difference and no interval in the table. This reads as a test: "B declines faster". | D | major | (a) |
| UX-52 | The factor defaults to "cohort" (first alphabetically, three levels). The user cannot restrict the model to two groups; group C (3 patients) stays in. | D | major | (b) |
| UX-53 | The first fit shows only "Fitting 1 of 3 …"; nothing says that R is being downloaded. | D | minor | (b) |
| UX-54 | Adding covariates jumps to "Custom model" without notice; the earlier fit is gone. | D | major | (b) |
| UX-55 | Estimates have no units. The "Status" column repeats the slope. | D | minor | (c) |
| UX-56 | In a model with a group interaction the plot shows one dashed line labelled "Whole cohort: -4.77 ml/min/1,73m²/yr". That is group A's slope; the "Reference slope" column is group A only. | D | major | (e) |
| UX-57 | "no p-values are computed", and nothing more. "Slope × cohort: B (reference A) -3.431 [-6.69, -0.18]" will be written up as "significant, p<0.05". The lmerTest hint exists only in the R comments of the export. There is no text for a methods section. | D | major | (a) |
| UX-58 | "Complete cases: 25 patients / 28", but "Excluded patients (1)" lists only "3: Missing cohort". Patients 5 and 10 (no eGFR) are not mentioned. | D | major | (e) |
| UX-59 | "Apply preset event and AKI exclusions" is ticked and says "applied; 0 eligible measurements excluded", because the default preset has "AKI windows none". The user believes AKI was removed. With "CKD progression" instead, "Slope × cohort: C" moved from +8.06 to −6.62 and the residual SD from 8.48 to 1.77. | D | major | (a) |
| UX-60 | Level terms are read as slope effects. "cohort: B (reference A) 3.877" and "sex: w (reference m) -3.256" are baseline differences. The default "Level (Shift)" means that sex and age do not adjust the slope. | D | not rated | (a) |
| UX-61 | The custom projection target defaults to 0: "Custom target (below 0 ml/min/1,73m²) Projected crossing 9.63". "G4 boundary … 5.98" years for group B is at the edge of the 6.1 years of data. It is flagged "Time uncertainty is not estimated." and "not a patient-specific prediction", but shown as a bare number. | D | minor | (a) |
| UX-62 | After a Trajectories setting changed, the model result was reset to "Not fitted" with no message. | D | minor | (b) |

### Export

| ID | Finding | Cases | Severity | Kind |
| --- | --- | --- | --- | --- |
| UX-63 | The cohort workbook is hard to read. It opens on "measurements"; the results are in sheet 3, "cohort", with 74 columns; "Parameter" is column 60; there are three rows per patient; warnings are spread over five columns; the preset is only in a JSON cell on "settings". | A, B | major (A: major; B: minor) | (d) |
| UX-64 | The exported plot has no slope, no interval and no y-axis title, and names no preset or event. It says "0 uncertain individual OLS fits". | A, B | minor | (d) |
| UX-65 | Export rows for creatinine read `reason = n_below_threshold` with n=10. This looks like too little data; it only means that no trend was requested. | A | not rated | (d) |
| UX-66 | The export gives `endpoint_percent_decline` as +31.08 where the screen shows "-31%", and an age of 54.86 where the screen shows "~55y". | B | not rated | (e) |
| UX-67 | The "about" sheet says "eGFR is computed from creatinine + demographics", but here the eGFR was imported. | B | not rated | (e) |
| UX-68 | The AKI information in the export is one `aki` column ("AKI II"): no dates, no episode sheet, no excluded flag per measurement. Dates exist only as hover text inside the SVG. | C | major | (d) |
| UX-69 | The model export holds only the last configuration. Columns are named `factor_0_`, `factor_1_`. The R script expects "cohort-models.xlsx"; the downloaded file is "cohort-models-20261116-1612.xlsx". Extracting the script needs R. | D | major | (d) |

### Persistence and navigation

| ID | Finding | Cases | Severity | Kind |
| --- | --- | --- | --- | --- |
| UX-70 | A reload loses everything without warning ("No data loaded yet"). "Remember on this device" is disabled until data are loaded. | C | major | (b) |
| UX-71 | With "Remember on this device" the data survive a reload, but preset, trend and display are reset without notice; the table looks the same although the AKI exclusion is gone. | C | major | (e) |
| UX-72 | The only statement on where data are processed is "Data is processed in your browser." Methods says "Load or upload a workbook." | C | minor | (c) |
| UX-73 | Returning from Methods keeps tab, axis, highlight and preset, but closes the settings panel and resets the scroll position. | C | not rated | (b) |
| UX-74 | Many terms are not understood by this user; see section 5. | A, B, C, D | not rated | (c) |

## 4. Possible defects to verify

These look like defects rather than design choices. **None has been verified
against the code yet.** Each may turn out to be intended behaviour that is
poorly explained.

| # | Observation | How to reproduce (from the case report) | Finding |
| --- | --- | --- | --- |
| 1 | The plot chip "Whole cohort: -4.77 ml/min/1,73m²/yr" shows the reference group's slope. | Demo data with attributes; Cohort models; fit a model with factor "cohort" as level and slope; compare the chip with the "Reference slope" column. | UX-56 |
| 2 | "Inspect events (7)" with 8 events loaded. | Load the demo including events ("506 lab values, 8 events and 26 attribute rows loaded."); open the overlay. | UX-32 |
| 3 | "Excluded patients (1)" while complete cases are 25 of 28. | Same model as in 1; compare "Complete cases: 25 patients / 28" with the excluded list ("3: Missing cohort"); patients 5 and 10 have no eGFR. | UX-58 |
| 4 | `endpoint_percent_decline` is positive in the export where the screen shows a negative percent. | Demo data, CKD preset on eGFR; export the cohort workbook; compare a patient's "-31%" badge with the column (+31.08). | UX-66 |
| 5 | "0 values without a numeric measurement" with a "<0,3" value present. | Upload a lab file with one creatinine typed as "<0,3"; read the import summary. | UX-05 |
| 6 | The help says µmol/l values are converted automatically, but a µmol/l row stays a separate parameter and is not used for eGFR. | Upload creatinine in mg/dl with one row of the same patient in µmol/l; derive eGFR; compare the counts and the columns. | UX-11 |
| 7 | Creatinine under another test name or unit is left out of eGFR while the page says "0 cannot be computed". | Upload creatinine as "Kreatinin" for some patients and "Kreatinin i.S." for one; derive eGFR; read "32 source values, 0 cannot be computed". | UX-10 |
| 8 | The "about" sheet says eGFR is computed when it was imported. | Demo data without deriving eGFR; export the cohort workbook; read the "about" sheet. | UX-67 |
| 9 | The R script expects `cohort-models.xlsx`; the download carries a timestamp. | Export a fitted model; compare the file name read in the script with the downloaded name. | UX-69 |
| 10 | Analysis settings are reset after a reload with "Remember on this device". | Tick "Remember on this device", choose the CKD preset and Trend, reload; the data are kept, preset, trend and display are not. | UX-71 |
| 11 | Switching to "Acute review" and back leaves Trend off and shows "G5 no fit" everywhere. | CKD preset with Trend on; switch the eGFR column to "Acute review", then back to the CKD preset. | UX-23 |
| 12 | "-41%" without a "40% decline" badge and without a reason. | Demo data, CKD preset; patient 26 shows "-41%, G5 @ ~65y". | UX-47 |
| 13 | The "Status" column of the model table repeats the slope. | Fit any cohort model; read the result table. | UX-55 |
| 14 | An import warning for a CSV names "Sheet1". | Upload a CSV with a "<" value; open "1 import diagnostics — show details". | UX-04 |

## 5. Wording this user did not understand

Exact strings, merged across cases.

- **Data page:** "Parameter–unit combinations" (A); "Derive eGFR", "derived
  parameter", "Imported parameter selections are unchanged." (A); "censored
  value (limit, not exact)" (A); "25 estimated birth-date anchors; other ages
  use recorded birth dates." (C).
- **Models and aggregation:** "OLS", "Theil–Sen", "Rolling OLS", "Segmented
  OLS" (A, B, C); "Time balancing" / "Aggregation" (B); "Aggregation: Raw
  (unweighted points)", "Fit preparation" (A); "Available before time
  aggregation" (A, C); "Fit disabled" (C); "prepared rows" (B); "UTC calendar
  months" (B).
- **Settings:** "General defaults only. Open a parameter's settings to assign a
  specialist profile; independent settings stay unchanged." (A); "CKD
  progression · Own settings" (A, B); "Use shared settings" (A, B, C);
  "Editing creates independent settings for this parameter." (C); "Censor
  after chronic dialysis" (A, C); "censoring" (B); "Display-fit AKI exclusions
  and aggregation do not apply." (C).
- **Plots:** "Shared parameter scale" (A, C); "Dashed: individual OLS lines
  from the prepared analyses." (C); "an open diamond on the time axis marks a
  peak without a measurement of this parameter within 2 days" (C).
- **Badges and endpoints:** "rapid ↓" (B); "G5 < 3 dates" (A); "G5 not
  projected" (A); "G5 no fit" (B); "G5 @ ~55y" (B); "G5 not projected after
  KRT" (C); "KRT" (B); "endpoint-eligible dated exact numeric measurements"
  (A, B); "bounds" (B); "scalar endpoint prediction" (B); "finite ordered
  bounds strictly below zero" (B); "serum-creatinine doubling surrogate" (B).
- **Cohort models:** "Level (Shift)" / "Level & Slope (Interaction)"; "Random
  effects: Patient intercept & slope / Intercept only"; "Fixed-effect
  profile"; "Associations are conditional on this model and population.";
  "numeric factors at fitted centers, categorical factors at reference
  levels"; "Count precedes time balancing, run-in and factor exclusions."
  (C, D); "Preset windows: applied; 0 eligible measurements excluded"; "One
  mixed model per selected unit, fit sequentially. Failures are isolated per
  unit."; "PATIENT SLOPE SD", "INTERCEPT-SLOPE CORRELATION", "RESIDUAL SD";
  "FIT CONFIG a57adae1", "DATASET cohort (d3d60549)", "webr-lme4"; "A 12
  (12), B 10 (10), C 3 (3)"; "Ref: w"; "Data preparation Shared"; "Complete
  cases" (all D unless marked).
- **Export codes:** `birth_anchor`, `slope_mode: global`,
  `slope_ci_includes_zero` (A); `n_below_threshold` (A, B);
  `beyond_projection_horizon` (B).

## 6. Changes the cases recommended

The four cases each named five changes. They are merged here without
additions. Order: changes named by several cases first, then by the rank each
case gave them (A, B, C, D).

1. **Show eGFR slopes without an extra step.** Show slopes with their unit by
   default for eGFR, with the trend line drawn (A). Offer the CKD preset with
   Trend on at first load, or a one-line prompt saying that slopes need
   "Trend" (B). Make "Trend" draw the line in one step and restore it when
   leaving "Acute review" (C). Addresses UX-13, UX-14, UX-23, UX-30.
2. **Badges with text and with the reason.** Badges carrying text such as "2
   values only", "rapid decline", "1 value excluded" (A). Text badges as the
   default (B). The reason in the badge: "G5 not projected (> 20 years)",
   "G5: Trend is off", "40 % not confirmed" (B). Rapid decline with its own
   icon, not a warning triangle (B). Addresses UX-15, UX-16, UX-44, UX-47.
3. **Show what was fitted.** Fitted n beside raw n, for example "2 of 10
   fitted" (B) or "7 of 11, quarterly medians" (C). Print the active preset
   next to every plot and column, and keep the previous slope visible after a
   settings change (C). Addresses UX-19, UX-24, UX-26.
4. **Say what AKI exclusion and event censoring did.** Per patient: "0 AKI
   episodes detected", and why sparse values cannot be detected (A). Show
   "Exclude AKI windows from fit" and the event censoring checkboxes under
   every preset; warn on the result when a fit includes values after
   transplant or dialysis, or inside an AKI window (C). When the preset has no
   AKI windows, say so instead of "applied; 0 … excluded", and point to "CKD
   progression" (D). Addresses UX-20, UX-21, UX-22, UX-59.
5. **Report unused creatinine at import and at eGFR.** For example "6
   creatinine values not used: 5 under 'Kreatinin i.S.', 1 in µmol/l", with an
   offer to merge names and convert units, in place of "0 cannot be computed"
   (A). Addresses UX-03, UX-10, UX-11.
6. **Add sortable columns** for the slope with its unit, the projected G5 age
   and the observed events (B). Addresses UX-14, UX-45.
7. **Add an AKI episode list** (patient, onset, peak date, stage, baseline,
   peak) as a screen view and an export sheet, and show the onset date in the
   badge popover (C). Addresses UX-40, UX-42, UX-43, UX-68.
8. **Plain-language result for the interaction model.** State it as a sentence
   with units, for example "Group B declines 3.43 ml/min/1.73m²/yr faster than
   A (95% CI 0.18 to 6.69)", draw one line per group, and rename the chip to
   "Reference (cohort A)" (D). Addresses UX-55, UX-56, UX-60.
9. **Flag weak fits.** A slope whose interval includes zero needs a visible
   badge and `unstable_slope` in the export. Suppress "rapid ↓" and
   `rapid_progression` when n < 3 (A). Addresses UX-17, UX-18.
10. **Say what to do without a p-value.** Next to "no p-values are computed",
    say what the interval means and that the exported script supports
    lmerTest. Add a copyable methods paragraph (D). Addresses UX-57.
11. **Let the user choose the two groups, and keep fits.** Add a level filter
    to the factor, and keep earlier fits side by side in the table and the
    export (D). Addresses UX-52, UX-54, UX-69.
12. **Complete the exclusion account.** List all patients behind "25 / 28"
    with reasons (D). Addresses UX-58.
13. **Overlay.** Label or highlight the hovered line and mark events; put
    preset, aggregation and slope in the plot caption and the cohort sheet
    (B). Addresses UX-31, UX-36, UX-64.
14. **Make template and export readable in Excel.** Template: an example row
    and a format note (dates, decimal comma, m/w, ageAtLab or birthDate).
    Export: results sheet first, with PatientID, Parameter, slope, unit,
    model, n, n_fitted and one warnings column at the left (A). Addresses
    UX-02, UX-63.
15. **Persistence.** Persist analysis settings with "Remember on this device",
    or say on the Trajectories page that they were reset. Warn before a reload
    discards session-only data (C). Addresses UX-70, UX-71.
16. **Orient before modelling.** Show attribute names and per-level counts on
    the Data page, add a per-group slope summary to the grouped table, and put
    a two-sentence explanation at the top of Cohort models (D). Addresses
    UX-08, UX-29, UX-50.
