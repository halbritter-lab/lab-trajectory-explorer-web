import { ReferenceTable } from '../ReferenceTable'

export function Export() { return <>
<p>Exports use the current patient and parameter selection and the active analysis settings. Check this scope before downloading a workbook.</p>
<h3 id="methods-workbooks" tabIndex={-1}>Workbook contents</h3>
<ReferenceTable label="Workbook contents"><table><thead><tr><th>Sheet</th><th>Contents</th></tr></thead><tbody>
<tr><td>measurements / raw_measurements</td><td>Analysis values and imported source rows in the selected scope. Computed values are marked as derived.</td></tr>
<tr><td>cohort / slopes</td><td>The displayed summaries, fit estimators, quality flags and endpoint results.</td></tr>
<tr><td>events / patient_attributes / demographics</td><td>Event context, attributes, resolved demographics, overrides and warnings.</td></tr>
<tr><td>parameters / settings</td><td>Parameter identity, derivation formula and source, fit configuration, source file and exported scope.</td></tr>
<tr><td>about</td><td>Research-use disclaimer and interpretation notes.</td></tr></tbody></table></ReferenceTable>
<p>Select the source creatinine parameter as well as the computed eGFR parameter to include its imported measurements in the export.</p>
<h3 id="methods-provenance" tabIndex={-1}>Trace a result</h3>
<p>In the exported slope table, <code>fit_model</code> identifies the estimator and <code>slope_mode</code> records rolling, segmentation and other paths. Retain the settings and parameter sheets alongside results to reproduce the analysis.</p>
<p>Cohort-model workbooks record their selected model and input policy. Review model status and warnings before exporting. See <a href="#methods/cohort">Cohort models</a> for model assumptions and projection safeguards.</p>
</> }
