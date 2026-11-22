import { ReferenceTable } from '../ReferenceTable'

export function Export() { return <>
<p>Exports use the current patient and parameter selection and the active analysis settings. Check this scope before downloading a workbook.</p>
<h3 id="methods-workbooks" tabIndex={-1}>Workbook contents</h3>
<ReferenceTable label="Workbook contents"><table><thead><tr><th>Sheet</th><th>Contents</th></tr></thead><tbody>
<tr><td>measurements / raw_measurements</td><td>Analysis values and imported source rows in the selected scope. Computed values are marked as derived.</td></tr>
<tr><td>cohort / slopes</td><td>The displayed summaries, fit estimators, quality flags and endpoint results.</td></tr>
<tr><td>aki_episodes</td><td>Detected AKI episodes of the selected patients: stage, onset, peak and baseline per serum creatinine parameter.</td></tr>
<tr><td>events / patient_attributes / demographics</td><td>Event context, attributes, resolved demographics, overrides and warnings.</td></tr>
<tr><td>parameters / settings</td><td>Parameter identity, derivation formula and source, fit configuration, source file and exported scope; at the end of settings, Trend and each parameter's settings as the app keeps them, which "Apply settings from an export" in the analysis record (Trajectories) applies again.</td></tr>
<tr><td>about</td><td>Research-use disclaimer, interpretation notes, app version, export time and identifiers of the export and its input data.</td></tr>
<tr><td>columns</td><td>One row per column of the cohort or slopes sheet: meaning, unit and when the cell is empty.</td></tr>
<tr><td>rolling_windows</td><td>The fitted windows of every Rolling OLS parameter: bounds of the window, first and last fitted point (a measurement, or a monthly or quarterly median under time balancing), their number and the window slope per year. Empty without a Rolling OLS parameter.</td></tr>
<tr><td>import_diagnostics</td><td>Rows the import rejected and its warnings for lab values, events and attributes, with the row of the source file, and the rows behind the data checks of the Data page. Lines about patients outside the export are left out; the download on the Data page holds all of them.</td></tr>
<tr><td>anchor_comparison</td><td>The before/after comparison at an anchor event, one row per patient and parameter that uses it: the anchor event, the slope before and after it with number of fitted points, span and 95% interval, and the difference after minus before. Empty when no parameter uses the comparison.</td></tr>
<tr><td>peri_event_creatinine</td><td>Serum creatinine around the events selected on the Data page, one row per event: baseline (last value on or before the event day), highest value in the 48- or 72-hour window counted in calendar days, absolute and relative rise, and whether the KDIGO creatinine criterion is met or why the event is not evaluable. Empty while no events are selected.</td></tr></tbody></table></ReferenceTable>
<p>Select the source creatinine parameter as well as the computed eGFR parameter to include its imported measurements in the export.</p>
<h3 id="methods-provenance" tabIndex={-1}>Trace a result</h3>
<p>In the exported slope table, <code>fit_model</code> identifies the estimator and <code>slope_mode</code> records rolling, segmentation and other paths. Retain the settings and parameter sheets alongside results to reproduce the analysis.</p>
<p>Cohort-model workbooks record their selected model and input policy. Review model status and warnings before exporting. See <a href="#methods/cohort">Cohort models</a> for model assumptions and projection safeguards.</p>
<h3 id="methods-model-workbook" tabIndex={-1}>Cohort-model workbook</h3>
<p><em>Export models (xlsx)</em> on the Cohort models page writes a second workbook with the fitted models.</p>
<ReferenceTable label="Cohort-model workbook contents"><table><thead><tr><th>Sheet</th><th>Contents</th></tr></thead><tbody>
<tr><td>models</td><td>One row per fitted unit: status, formula, model configuration, data preparation, R and package versions, warnings and variance components.</td></tr>
<tr><td>coefficients / vcov</td><td>Every fixed effect with unit, estimate, 95% interval and standard error, and the fixed-effect variance-covariance matrix.</td></tr>
<tr><td>factors / centering / excluded_patients</td><td>Factors with type, effect and reference level and whether the type and the reference were chosen by the user, the mean each numeric factor was centred at, and the patients left out with the reason.</td></tr>
<tr><td>projections</td><td>Present when a projection was applied: profile, thresholds and results.</td></tr>
<tr><td>model_rows / model_input_flags</td><td>The rows each model received in R, and every measurement of the series with whether it entered, was aggregated into a time-balancing median, or why it was excluded.</td></tr>
<tr><td>r_script</td><td>An R script that refits the models from model_rows.</td></tr>
<tr><td>about</td><td>Research-use disclaimer, interpretation notes, <code>export_id</code>, app version and export time.</td></tr></tbody></table></ReferenceTable>
<p><code>unit_key</code> identifies the fitted unit on every sheet: <code>cohort</code> for the whole cohort, <code>group:&lt;value&gt;</code> for a group. Join sheets on <code>unit_key</code>; <code>entity</code> is a display label and can repeat. <code>export_id</code> in the about sheet ties a workbook to its <code>r_script</code>.</p>
<p>To refit a model in R:</p>
<ol>
<li>Copy the column <code>line</code> of the sheet <code>r_script</code> into an R script and save it in the folder of the workbook, or set <code>mm_workbook</code> in its first lines to the path of the workbook.</li>
<li>Run the script in R with the packages <code>readxl</code> and <code>lme4</code> installed. It stops when the workbook is not the export it was written for.</li>
<li>The script refits every successfully fitted unit from <code>model_rows</code> and prints the estimates of the app and of the refit side by side. The fits are kept in <code>mm_fits</code>, named by <code>unit_key</code>, for further analysis.</li>
</ol>
</> }
