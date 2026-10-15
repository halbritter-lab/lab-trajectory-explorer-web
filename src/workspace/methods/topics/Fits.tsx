import { ReferenceTable } from '../ReferenceTable'

export function Fits() { return <>
<p>Use General defaults for general preparation, or open a parameter's settings for an independent preset. Specialist profiles apply to that parameter only. Enable Trend to calculate its slope; the line button changes only the drawing. Check which measurements feed the fit before interpreting a slope.</p><section className="methodology-section"><h3 id="methods-choosing" tabIndex={-1}>Choosing a Fit Model</h3>

<p>All five models describe change over time. Choose according to the shape of the course and the question you want to explore; none is more correct in general.</p>
<ReferenceTable label="Fit model comparison"><table><thead><tr><th>Model</th><th>When to use it</th><th>What the summary slope means</th></tr></thead><tbody>
<tr><th scope="row">OLS</th><td>A roughly linear course without extreme values.</td><td>One least-squares trend through the fitted measurements.</td></tr>
<tr><th scope="row">Theil–Sen</th><td>A course with isolated outlying measurements.</td><td>Median of pairwise slopes; at least three observations and two distinct dates.</td></tr>
<tr><th scope="row">Rolling OLS</th><td>Inspect changes in the rate over time.</td><td>The table reports global OLS; short chart lines show local two-year fits.</td></tr>
<tr><th scope="row">Segmented OLS</th><td>Inspect stretches separated by gaps longer than 180 days.</td><td>The table reports global OLS; chart lines show the fitted segments.</td></tr>
<tr><th scope="row">No fit</th><td>Review measurements without imposing a trend.</td><td>No trend or slope is calculated.</td></tr></tbody></table></ReferenceTable>
<p>Slope confidence intervals describe uncertainty in the estimated slope, not the range of future measurements. OLS has automated and external comparison checks; the other estimators have automated checks only. See <a href="#methods/sources">validation scope and limitations</a>.</p>
</section><section className="methodology-section"><h3 id="methods-quality" tabIndex={-1}>Quality Flags</h3>

      <p>
        The reason field mirrors the numeric core and carries a quality flag when the slope is
        either uncomputable or based on a short raw observation window:
      </p>
<ReferenceTable label="Fit quality flags"><table><thead><tr><th>Flag</th><th>Meaning</th></tr></thead><tbody><tr><th scope="row"><code>no_numeric_values</code></th><td>the series contains no parseable numeric measurements
          for this patient, so no slope is produced.</td></tr><tr><th scope="row"><code>n_below_threshold</code></th><td>the selected numeric path produced no slope. This
          includes fewer than two values, mode-specific minimum counts, and a deliberately disabled
          fit. The exact two-point fallback is described under <a href="#methods/fits/ols">OLS details</a>.</td></tr><tr><th scope="row"><code>span_too_short</code></th><td>the raw numeric observation span is fewer than 365
          days. A slope is normally produced; the exception is a series whose fitted measurements
          all share one date, for which no slope exists. This field describes the unfiltered
          series; the displayed reliability rule below also checks the fitted span.</td></tr></tbody></table></ReferenceTable>
      <p>
        These flags are shown, not only exported: when a fit is shown, the patient table states
        the flag in the affected cell and the individual patient view repeats it beneath the chart;
        the overlay draws affected fit lines dotted. The colour says which kind of problem it is,
        not which threshold was crossed: grey text (<span className="wt-muted">n &lt; 3</span>)
        means no slope was produced at all, an amber note (<span className="wt-warning">n &lt; 3,
        uncertain slope</span>, <span className="wt-warning">Follow-up &lt; 1 year, uncertain
        slope</span>) means a slope exists but should be treated as unstable. The same <em>n &lt;
        3</em> label therefore appears in either colour depending on whether a slope came out of it.
        When all fitted measurements share one date, the grey note reads “All fitted measurements
        on one date”.
      </p>
      <p>
        <strong>The displayed flag is broader than the reason field.</strong> A series of exactly
        two points is a case the reason codes do not cover: the fit falls back to the exact
        two-point slope and reports R² = 1 with no reason set, because two points always define a
        line perfectly. Censoring, exclusions, or time balancing can also leave a much thinner or
        shorter fitted window than the raw series suggests. The badge and the{' '}
        <code>unstable_slope</code> export column therefore test both the fitted count and fitted
        span directly: fewer than three fitted measurements, or under a year between the first and
        last fitted points. The numeric <strong>reason</strong> field is left unchanged,
        so it can differ from this stricter displayed reliability rule.
      </p>
</section><details className="methodology-calculations"><summary>Calculation details</summary>
<details className="methodology-detail"><summary>Fit model assumptions</summary>
<section className="methodology-section"><h3 id="methods-models" tabIndex={-1}>Fit model assumptions</h3>      <p>
        All five models answer the same question — how fast is this parameter changing — but they
        differ in what they assume about the trajectory. Picking one is a judgement about the data,
        not about accuracy: none of them is more correct in general.
      </p>
      <ul>
        <li>
          <strong>OLS</strong> — the default. A single least-squares line through all included
          points. Appropriate when the course is roughly linear over the fitted window and free of
          extreme values. It is also the most thoroughly verified of the five (see below).
        </li>
        <li>
          <strong>Theil-Sen</strong> — the median of all pairwise slopes, which makes it insensitive
          to a minority of outlying points. Appropriate when isolated extreme values — an AKI spike,
          a suspected lab error, a single post-operative measurement — would tilt an OLS line, and
          you would rather not remove them by hand. It costs statistical efficiency when the data
          are in fact clean. At least three observations and two distinct dates are required.
          The intercept is median(value) minus slope times median(time). The reported 95% bounds
          describe uncertainty in the slope, not a prediction interval for individual values.
        </li>
        <li>
          <strong>Rolling OLS</strong> — a separate OLS fit inside each two-year window (730
          days), moved forward in steps of 180 days; a window needs at least three fitted
          measurements. Appropriate when the rate of change itself changes over the observation
          period and a single slope would average a fast phase together with a slow one. The chart
          draws each window's line over the 180 days around the window centre, and the table gives
          the number of windows with the smallest and largest window slope. The slope, R² and
          confidence interval reported for the column, and the rapid-decline flag, remain those of
          the single OLS line through all fitted measurements. A fitted span under two years has
          no window and therefore no local slopes.
        </li>
        <li>
          <strong>Segmented OLS</strong> — separate OLS fits per segment. A new segment starts
          wherever two consecutive fitted measurements lie more than 180 days apart; clinical
          events do not split a series. A segment needs at least three measurements to be fitted,
          and the chart draws one line per fitted segment. The slope, R² and confidence interval
          reported for the column remain those of the single OLS line through all fitted
          measurements; the segment slopes are shown as lines only. Use event censoring or
          exclusion when an event should remove data.
        </li>
        <li>
          <strong>No fit</strong> — measurements only. Appropriate for acute review, where drawing a
          trend line through an unstable course would suggest a trajectory the data do not support.
        </li>
      </ul>
</section>
</details><details className="methodology-detail"><summary>Fit Pipeline</summary>
<section className="methodology-section"><h3 id="methods-pipeline" tabIndex={-1}>Fit Pipeline</h3>

      <p>
        Each parameter column uses the shared fit configuration unless it has its own override.
        Presets such as general exploration,
        CKD progression, and acute review are named defaults over the same explicit pipeline:
        filtering, optional event and AKI exclusions, time balancing, model fitting, endpoint
        derivation, and export. All slopes are expressed{' '}
        <strong>per year</strong> (the regression x-axis is time in fractional years), so a
        creatinine slope is in mg/dl per year and an eGFR slope is in mL/min/1.73m² per year — the
        usual convention for reporting renal function decline.
      </p>
      <ul>
        <li>
          <strong>Data filter</strong> — kidney transplant, chronic dialysis, acute dialysis
          intervals, unknown-dialysis intervals, and AKI windows can be included or excluded
          according to the active series configuration. Display-only events remain visible context
          and do not alter fits. Unknown dialysis can be handled as display-only, as a dated
          interval exclusion when an end date exists, or as censoring from the start date.
        </li>
        <li>
          <strong>Time balancing</strong> — raw values, monthly medians, or quarterly medians can
          be used for the fit after exclusions are applied, so post-event values are not merged into
          pre-event aggregates.
        </li>
        <li>
          <strong>Fit model</strong> — no fit, OLS, Theil-Sen, rolling OLS, and segmented OLS are
          available. The trend legend names the active model, and no trend legend is shown when the
          model is off. In the exported slope table, <strong>fit_model</strong> names the estimator
          that produced the scalar slope, while <strong>slope_mode</strong> records rolling,
          segmentation, and other analysis paths. Together they make the scalar result traceable.
          See <a href="#methods/fits/choosing">Choosing a fit model</a>.
        </li>
        <li>
          <strong>Endpoints</strong> — a series counts as eGFR when its unit is mL/min/1.73 m²,
          whatever it is called; a clearance in ml/min does not. Such series can report total
          percent change from the first to latest eligible measurement,
          independent observed G4 (&lt;30) and G5 (&lt;15), and projected age to G5.
          Endpoints use dated exact numeric eGFR measurements before the first kidney transplant
          or chronic dialysis start and outside complete dated acute dialysis intervals,
          independently of display-fit AKI exclusions or aggregation. Kidney replacement therapy
          is reported separately as kidney failure reached with its type and date, independently
          of lab-confirmed G5. After kidney replacement therapy, no future individual G5
          crossing is projected. The minimum confirmation interval defaults to 90 days
          and can be set from 1 to 365 whole days; a longer interval could never be met, because a
          confirming value must follow within 12 calendar months.
        </li>
        <li>
          <strong>Exports</strong> — patient and cohort slope exports use the same event and AKI
          filtering inputs as the visible plots. Measurement rows remain visible even when they are
          excluded from the configured fit.
        </li>
      </ul>
      <p>Values marked &lt; or &gt; are bounds. They remain visible with their numeric
        limits and count as raw numeric measurements, but are excluded from slopes,
        endpoint evaluation and prediction, AKI detection, and cohort mixed models.
        Exact measurements on the same date remain eligible.</p>
</section>
</details><details className="methodology-detail"><summary>Analysis Presets</summary>
<section className="methodology-section"><h3 id="methods-presets" tabIndex={-1}>Analysis Presets</h3>

      <p>
        A preset sets every analysis setting at once. Changing a single setting afterwards marks
        the configuration as custom.
      </p>
      <ul>
        <li>
          <strong>General exploration</strong> (the starting configuration) — OLS on raw
          measurements; no event censoring, no AKI exclusion, no time balancing, no endpoints.
        </li>
        <li>
          <strong>Theil–Sen robust trend</strong> — General exploration with the Theil–Sen
          estimator instead of OLS. Exports record it as a custom configuration.
        </li>
        <li>
          <strong>CKD progression</strong> — OLS on quarterly medians; values censored from kidney
          transplant and from chronic dialysis start; acute dialysis intervals and dated dialysis
          intervals of unknown intent excluded; a 30-day window after each AKI onset excluded;
          percent decline, observed G4, observed G5 and projected age to G5 switched on, with a
          90-day minimum confirmation interval.
        </li>
        <li>
          <strong>Acute review</strong> — raw measurements without a fit; no event censoring, no
          AKI exclusion, no endpoints.
        </li>
      </ul>
      <p>
        Every preset sets the rapid-decline threshold to 5 mL/min/1.73m² per year. Endpoint
        settings take effect on eGFR series only.
      </p>
</section>
</details><details className="methodology-detail"><summary>Time Balancing: Monthly and Quarterly Medians</summary>
<section className="methodology-section"><h3 id="methods-balancing" tabIndex={-1}>Time Balancing: Monthly and Quarterly Medians</h3>

      <p>
        With monthly or quarterly medians, the measurements that remain after exclusions are
        grouped by UTC calendar month or calendar quarter (January–March, April–June,
        July–September, October–December). Periods are not counted from the patient&apos;s first
        measurement; 31 December and 1 January fall in different periods.
      </p>
      <p>
        Each period with at least one measurement contributes one point. Its value is the median;
        with an even count this is the mean of the two middle values. Its date is the date of the
        lower-middle measurement in date order (the earlier of two, the middle of three, the
        second of four), so it is always a date on which a measurement exists. Periods without
        measurements contribute nothing; no value is interpolated.
      </p>
      <p>
        Example: 50, 44, 47 and 41 on 10 January, 20 February, 5 March and 25 March 2021 give the
        quarterly point 45.5 on 20 February 2021. Minimum point counts and the fitted span refer
        to these points, not to the raw measurements.
      </p>
</section>
</details><details className="methodology-detail"><summary>Ordinary Least Squares (OLS)</summary>
<section className="methodology-section"><h3 id="methods-ols" tabIndex={-1}>Ordinary Least Squares (OLS)</h3>

      <p>
        The OLS fit is unweighted: every fitted point has the same weight. Time is measured in
        years of 365.25 days from the first fitted point (1 January 2020 to 1 January 2021 is
        366 / 365.25 = 1.002 years), and the intercept is the fitted value at that point.
      </p>
      <p>
        A regular fit needs at least three points. Exactly two points on different dates give the
        exact line through both, with R² = 1 and no confidence interval: 60 on 1 January 2020 and
        56 on 1 January 2021 give −3.99 per year. R² is the squared correlation of time and
        value; with three or more points it is unavailable when all fitted values are identical.
      </p>
      <p>
        The 95% interval is the slope ± t × standard error, where the standard error comes from
        the residual sum of squares with n − 2 degrees of freedom and t is the two-sided 95% value
        of Student&apos;s t distribution. It describes uncertainty in the slope, not a prediction
        interval.
      </p>
</section>
</details>
</details>
</> }
