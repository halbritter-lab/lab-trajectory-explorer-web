import type { ReactNode } from 'react'
import './methodology.css'

const SOURCES = {
  ckdEpi2021: 'https://www.kidney.org/professionals/ckd-epi-creatinine-equation-2021',
  niddkAdults: 'https://www.niddk.nih.gov/research-funding/research-programs/kidney-clinical-research-epidemiology/laboratory/glomerular-filtration-rate-equations/adults',
  niddkPrevious: 'https://www.niddk.nih.gov/research-funding/research-programs/kidney-clinical-research-epidemiology/laboratory/glomerular-filtration-rate-equations/adults/previous',
  ekfc2021: 'https://mayoclinic.elsevierpure.com/en/publications/development-and-validation-of-a-modified-full-age-spectrum-creati/',
  kdigoAki2012: 'https://kdigo.org/wp-content/uploads/2016/10/KDIGO-2012-AKI-Guideline-English.pdf',
  kdigoAkiUpdate: 'https://kdigo.org/guidelines/acute-kidney-injury/',
  kdigoCkdProgression: 'https://www.kidney.org/sites/default/files/docs/inker_et_al_ajkd_ckd_commentary_epub.pdf',
}

function ExternalSource({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  )
}

/** Static reference panel describing analytical methods used in Lab Trajectory Explorer. */
export function Methodology() {
  return (
    <article className="methodology-page">
      <h2>Theory &amp; Methods</h2>
      <p>
        This page combines a practical workflow guide with the statistical methods, quality flags,
        and derived series used in Lab Trajectory Explorer. It is provided for transparency and
        reproducibility only and is{' '}
        <strong>not for clinical decision-making</strong>.
      </p>

      <nav className="methodology-nav" aria-label="Theory and methods sections">
        <a href="#quick-guide">Quick Guide</a>
        <a href="#methodology-reference">Methodology Reference</a>
        <a href="#safety-sources">Safety &amp; Sources</a>
      </nav>

      <section className="methodology-section" id="quick-guide">
        <h3>Quick Guide</h3>
        <ol className="methodology-steps">
          <li>
            <strong>Load or upload a workbook.</strong> Use the demo dataset or upload lab rows under
            Data, then open Trajectories to compare patients in the table or open one patient.
          </li>
          <li>
            <strong>Choose the parameters.</strong> Pick measured laboratory parameters under
            Trajectories, or derive eGFR under Data when creatinine plus demographics are available.
          </li>
          <li>
            <strong>Set the fit policy before interpreting slopes.</strong> Configure event censoring,
            AKI exclusions, time balancing, and the fit model under Trajectories → Display and
            analysis, shared or per parameter column. The same policy feeds plots, cohort summaries,
            and exports.
          </li>
          <li>
            <strong>Inspect individual and cohort views together.</strong> Use the individual patient
            view for event context and the patient table or overlay for ranking, grouping, and outlier
            review.
          </li>
          <li>
            <strong>Use Cohort models for population-level estimates.</strong> Fit the whole
            cohort or selected groups, then verify the model status and warnings before using the
            result as exploratory evidence.
          </li>
          <li>
            <strong>Export only after checking the active configuration.</strong> Exports use the
            visible series settings and include a disclaimer sheet for reproducibility.
          </li>
        </ol>
      </section>

      <section className="methodology-section" id="methodology-reference">
        <h3>Methodology Reference</h3>

      <h4>Fit Pipeline</h4>
      <p>
        Cohort models prepare their measurements with the analysis settings chosen for the same
        parameter under Trajectories: its event censoring, AKI exclusion windows and time
        balancing. With general exploration, the setting of a newly loaded dataset, nothing is
        excluded or aggregated. The Cohort models page states the settings in use. A separate
        checkbox, on by default, applies the event censoring and AKI windows; turning it off
        retains the eligible exact dated measurements inside those windows, while time balancing
        still applies. A parameter set to “No fit” supplies no model rows. The preview, each model
        status and the workbook record the selected policy and the number of measurements removed
        by the union of those windows. This count is taken before time balancing and
        missing-factor exclusions. Changing these settings under Trajectories discards fitted
        models.
      </p>
      <p>
        For each patient, model time zero is the first measurement retained after exclusion
        windows, time balancing, and any chronic run-in removal. Time is measured in fractional
        years from that patient&apos;s own first retained date; patients need not enter on the same
        calendar date. The fitted intercept describes this selected origin, not disease onset.
      </p>
      <p>
        Cohort models use observed eligible measurements and do not model why follow-up ends or
        visits occur. Interpretation relies on the visit and missing follow-up process being
        adequately explained by observed information and the fitted model. Dropout related to
        unobserved worsening can bias the trend. Review follow-up patterns and perform a
        study-specific sensitivity analysis before drawing clinical conclusions.
      </p>
      <p>
        Mixed-model fitting requires at least ten patients with repeated observations at
        different times: three times per patient for a random intercept and slope, or two for a
        random intercept alone. This is an input safeguard, not evidence of adequate statistical
        power. A singular fit remains available for inspecting and exporting its coefficients,
        but its projections and model lines are withheld. Review its random-effect structure
        and study-specific sample-size assumptions before interpreting it.
      </p>
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
          See <em>Choosing a fit model</em> below.
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

      <h4>Analysis Presets</h4>
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

      <h4>Time Balancing: Monthly and Quarterly Medians</h4>
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

      <h4>Choosing a Fit Model</h4>
      <p>
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
      <p>
        <strong>How far each model is verified.</strong> Two different checks apply, and they do
        not cover the same models:
      </p>
      <ul>
        <li>
          <strong>Stored regression cases</strong> — automated tests compare the results with
          stored cases that were originally generated by the Python <code>analyses</code> package.
          Since October 2026 the application may deviate from that package deliberately; each such
          change is documented and the affected case updated. The cases cover OLS, rolling OLS,
          segmented OLS and Theil-Sen, for Theil-Sen including the slope, separate-median
          intercept, 95% slope bounds and unavailable-fit cases.
        </li>
        <li>
          <strong>External comparison against an established clinical workflow</strong> — a manual
          cross-check by an outside group, which so far covers the <strong>OLS</strong> results
          only. It found no discrepancy. The other models have not been through this check.
        </li>
      </ul>
      <p>
        In short: OLS has both checks; rolling OLS, segmented OLS and Theil-Sen have the automated
        one only and are less verified than OLS. The observed G4/G5 and endpoint prediction rules
        below are this application's own research definitions: unit tests cover them, but neither
        check above applies. None of this replaces acceptance with representative research data.
      </p>

      <h4>Ordinary Least Squares (OLS)</h4>
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

      <h4>Observed G4/G5 and confirmed decline event algorithms</h4>
      <p>For each threshold independently, sort dated numeric eGFR measurements chronologically.
        A value below the threshold starts a candidate. The earliest later low measurement at least
        the configured minimum interval later, and no more than 12 UTC calendar months later,
        confirms it. Month addition clamps at the destination month's end (29 February 2020 to
        28 February 2021). A later low value starts a new candidate. A value at or above the threshold before
        confirmation interrupts the candidate; a subsequent low value starts another candidate.</p>
      <p>Record the initial crossing as the event date and the confirming measurement separately.
        After confirmation, retain both dates and values and show the first subsequent recovery
        separately. January 14, May 13, November 20 therefore gives a January G5 event, May
        confirmation and November recovery. January 14, March 20, May 13 instead leaves a new
        unconfirmed May candidate. These are research endpoint definitions.</p>
      <p>Ignore missing dates and nonfinite values. Conflicting values at the same timestamp do not
        establish persistence: a value at or above threshold interrupts an unconfirmed candidate.
        Tied qualifying values retain source order. Confirmation requires a later timestamp.</p>
      <p>Confirmed 40% and 57% eGFR decline are independent observed endpoints; 57% is a
        serum-creatinine doubling surrogate. Their baseline is the arithmetic mean of all eligible
        exact eGFR measurements from the first eligible date through 90 elapsed UTC days inclusive,
        counting duplicate rows. Decline candidates begin after this window so a baseline value
        cannot also be a candidate. A zero or negative baseline makes these events unavailable.
        Values at exactly 40% or 57% decline cross the respective boundary. They use the same
        minimum and 12-calendar-month maximum confirmation intervals, same-time conflict rule,
        and separate recovery evidence as G4/G5. The total first-to-latest percent change shown
        in the table is a different metric.</p>
      <h4>Individual endpoint prediction algorithm</h4>
      <p>Fit the same endpoint-eligible dated exact numeric measurements, including recovery after
        acute dialysis but excluding transplant and chronic dialysis dates onward, using global OLS
        or the selected Theil-Sen estimator. Display-fit AKI exclusions and aggregation do not affect this
        endpoint prediction. Rolling and segmented selections use global OLS for the scalar
        endpoint prediction; no-fit disables it. With y(t) = a + b × t, crossing time is
        (target − a) / b, in years from the first measurement. Add the remaining time after the
        latest measurement to the age at that measurement. When the birth date is known, this is
        the exact age. Otherwise the age is known in completed years only; the projected age can
        then be up to one year too low, and the table shows it as a whole number marked as
        approximate. A confirmed G5 event takes precedence over projection, whether or not the
        observed G5 endpoint is displayed.</p>
      <p>Require three measurements, at least 365 days between the first and the latest, a finite
        declining fit, a future crossing and an age at the latest measurement. Report a future
        crossing only within 20 years after the latest eligible measurement, including the
        boundary. The endpoint fit's slope confidence interval must have finite ordered bounds
        strictly below zero; missing bounds or an interval that includes zero withhold the
        crossing. With only three measurements this interval is so wide that it almost always
        includes zero: for values 60, 50, 25 at years 0, 1, 2 the slope is −17.5 per year but its
        interval runs from −72.5 to 37.5, so no crossing is reported. In practice a projection
        needs more measurements. Example: eGFR 48, 44, 41, 36, 33 and 29 on 15 January of six
        consecutive years gives a slope of −3.80 per year with an interval from −4.10 to −3.50;
        the fitted line reaches 15 about 3.7 years after the latest measurement. The displayed
        slope interval may differ because it can use different prepared rows. New measurements
        can change this prediction; they do not revoke a confirmed event.</p>
      <h4>Clinical Events and Exclusion Display</h4>
      <p>
        Clinical events are patient-level annotations with a date, title, optional end date, and
        optional description. Kidney transplant, dialysis, and other events can be loaded from the
        dataset. Kidney transplant and chronic dialysis can censor values from the event date;
        acute dialysis and unknown dialysis can exclude a dated interval when an end date is
        available. Events that are not configured to affect the fit remain display-only context.
      </p>
      <p>
        The UI separates <strong>context display</strong> from <strong>fit exclusion</strong>.
        Events and AKI windows can be hidden while excluded measurements still remain marked as
        grey open circles, because that marker means “excluded from the active fit,” not merely
        “episode label visible.” When measurement points are hidden but connecting lines are shown,
        excluded measurements remain marked.
      </p>

      <h4>Cohort Overlay Plot</h4>
      <p>
        The overlay is a spaghetti plot for each selected parameter across the patients in the
        shared scope. It can use age, calendar date, or years since each patient's first
        measurement as the x-axis. <em>Highlight patient</em> emphasises one trajectory; clicking a
        trajectory, or pressing Enter on it, opens the individual patient view. With AKI display on,
        episode diamonds are drawn for every trajectory; AKI windows and episode labels only for the
        highlighted one, to keep the overlay readable.
      </p>
      <p>
        The <em>Connecting lines</em> setting applies to the overlay as well as the individual
        patient charts. Turning it off removes trajectory connectors, while preserving all measured
        points and any excluded-measurement markers.
      </p>

      <h4>Quality Flags</h4>
      <p>
        The reason field mirrors the numeric core and carries a quality flag when the slope is
        either uncomputable or based on a short raw observation window:
      </p>
      <ul>
        <li>
          <strong>no_numeric_values</strong> — the series contains no parseable numeric measurements
          for this patient, so no slope is produced.
        </li>
        <li>
          <strong>n_below_threshold</strong> — the selected numeric path produced no slope. This
          includes fewer than two values, mode-specific minimum counts, and a deliberately disabled
          fit. The exact two-point fallback is the exception described below.
        </li>
        <li>
          <strong>span_too_short</strong> — the raw numeric observation span is fewer than 365
          days. A slope is normally produced; the exception is a series whose fitted measurements
          all share one date, for which no slope exists. This field describes the unfiltered
          series; the displayed reliability rule below also checks the fitted span.
        </li>
      </ul>
      <p>
        These flags are shown, not only exported: when a fit is shown, the patient table states
        the flag in the affected cell and the individual patient view repeats it beneath the chart;
        the overlay draws affected fit lines dotted. The colour says which kind of problem it is,
        not which threshold was crossed: grey text (<span className="wt-muted">n &lt; 3</span>)
        means no slope was produced at all, an amber note (<span className="wt-warning">n &lt; 3 ·
        uncertain slope</span>, <span className="wt-warning">Follow-up &lt; 1 year · uncertain
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

      <h4>Why an Endpoint Has No Value</h4>
      <p>
        When no projected age to CKD G5 can be computed, the patient table cell states the reason instead
        of staying empty, because an empty cell reads the same whether the patient is stable or the
        data are too thin:
      </p>
      <ul>
        <li>
          <strong>G5 no fit</strong> — no scalar slope is available, so the projection cannot be
          calculated. This is distinct from a fitted trend that is flat or rising.
        </li>
        <li>
          <strong>G5 not projected</strong> — no future age at G5 was computed. The badge states
          whether the endpoint fit is flat or rising, its slope confidence interval includes zero
          or is unavailable, or its crossing lies more than 20 years after the latest eligible
          measurement. A crossing at exactly 20 years is included. <strong>G5 not
          projected</strong> can also mean that the data contain a confirmed G5 event while the
          observed G5 endpoint is switched off; the badge says so, and the export gives the reason{' '}
          <code>observed_ckd_g5</code>. With the observed endpoint on, the CKD G5 badge with its
          dates is shown instead.
        </li>
        <li>
          <strong>G5 now</strong> — the fitted curve reaches 15 at or before the latest
          measurement, so no future crossing is projected. This does not establish an observed event.
        </li>
        <li>
          <strong>G5 no age</strong> — no age is available for the latest eligible measurement,
          so the projection has nothing to anchor to.
        </li>
        <li>
          <strong>G5 n &lt; 3</strong> and <strong>G5 &lt; 1 yr</strong> — fewer than three
          eligible measurements, or fewer than 365 days between the first and the latest. These
          are the same numbers as the stability thresholds above, applied to the endpoint-eligible
          measurements rather than to the fitted ones.
        </li>
      </ul>

      <h4>eGFR (Estimated Glomerular Filtration Rate)</h4>
      <p>
        eGFR is a computed series derived from serum creatinine and patient demographics. Its name
        contains “computed” and it is marked as derived throughout the UI to distinguish it from
        directly measured values. No eGFR is computed until a formula is applied under Data; the
        formula selector starts at “Off”. CKD-EPI 2021 is the first entry of the selector.
      </p>
      <ul>
        <li>
          <strong>CKD-EPI 2021</strong> — race-free equation published by Inker et al.
          (NEJM 2021). The National Kidney Foundation lists it as the recommended adult
          creatinine-based GFR-estimating equation and notes that it requires standardized
          creatinine assays. Used when the formula selector is set to <em>CKD-EPI 2021</em>.
        </li>
        <li>
          <strong>MDRD-4</strong> — four-variable (IDMS-traceable) Modification of Diet in Renal
          Disease equation, using the re-expressed 175-coefficient form for standardized
          creatinine. Used when the formula selector is set to <em>MDRD-4</em>. The published race
          multiplier is <strong>not applied</strong> here (race-free, consistent with the app's
          explicit no-race design).
        </li>
        <li>
          <strong>EKFC 2021</strong> — creatinine-based European Kidney Function Consortium equation
          published by Pottel et al. in Annals of Internal Medicine. It rescales creatinine by sex-
          and age-specific Q values
          (age-specific for 18-25 years, then 0.90 mg/dl for male and 0.70 mg/dl for female).
          The NIDDK notes that EKFC creatinine was developed mainly in White European populations,
          uses population-specific Q scaling, and does not meet US race-free equation
          recommendations.
        </li>
      </ul>
      <p>
        All computed equations are <strong>adult-only in this app</strong>: eGFR is only computed for patients aged
        ≥ 18 years at the time of measurement. Rows where age is missing or below 18 produce no
        eGFR value (even though EKFC itself is a full-age-spectrum equation, no paediatric output is
        emitted here). This series is{' '}
        <strong>not for clinical decision-making</strong>.
      </p>
      <p><strong>Inputs and assumptions:</strong></p>
      <ul>
        <li>
          <strong>Units</strong> — creatinine is expected in <em>mg/dl</em>. Values recorded in{' '}
          <em>µmol/l</em> are converted automatically (÷ 88.42); other units are not used as an eGFR
          source. A value stored under the wrong unit would therefore yield a wrong eGFR. The EKFC
          equation's own age-specific Q values for ages 18 to 25 are converted with the factor
          88.4; the difference changes an eGFR by at most about 0.03 mL/min/1.73 m².
        </li>
        <li>
          <strong>Sex</strong> — the equations use sex-specific coefficients for{' '}
          <em>m</em> (male) and <em>w</em> (female). For <em>d</em> (diverse / non-binary) there is
          no validated coefficient set, so the <strong>male coefficients are applied</strong>; such
          eGFR values may mis-estimate true GFR and should be interpreted with caution.
        </li>
        <li>
          <strong>Age</strong> — the equations use the patient's age at the date of measurement.
          This app does not read the age stated on each row directly. It derives every row's age
          from one birth-date anchor per patient (see <em>Resolving Sex and Age</em> below). A
          stated age that contradicts the others is corrected rather than used, and the
          contradiction is reported. Ages shown and exported can therefore differ from the values
          in the source file, usually by a year, and the eGFR follows that correction.
        </li>
      </ul>

      <h4>eGFR: Conditions, Age and Rounding</h4>
      <p>
        A creatinine measurement yields an eGFR value only when it has a lab date and a numeric
        value, the creatinine is greater than 0 mg/dl after conversion, the patient&apos;s sex is
        resolved, and the age is known and at least 18 (17 gives no value, 18 does). Otherwise no
        value is produced.
      </p>
      <p>
        Age is the number of whole completed years at the lab date. It changes on the birthday;
        fractional age is not used. A series therefore shows a small step at each birthday: one
        further year lowers CKD-EPI 2021 by 0.62%.
      </p>
      <p>
        Each result is rounded to one decimal, and the rounded value is used in every later
        calculation: fits, observed G4/G5, percent decline, projections, the rapid-decline flag
        and cohort models. CKD-EPI 2021 for a male aged 65 with 2.35 mg/dl gives 29.96, which is
        stored as 30.0 and is therefore not below the G4 boundary of 30. No upper or lower limit
        is applied to the result.
      </p>

      <h4>Resolving Sex and Age</h4>
      <p>Sex and a birth-date anchor are resolved once per patient.</p>
      <ul>
        <li>
          <strong>Sex</strong> — accepted spellings, ignoring case: m, male, man, mann, männlich,
          maennlich, mannlich; w, f, female, woman, weiblich, frau; d, divers, diverse. Other
          values, such as other or unknown, count as no sex. Sources in order: manual entry,
          attributes table, the code stated most often on the patient&apos;s lab rows. If the two
          most frequent codes tie, the rows yield no sex.
        </li>
        <li>
          <strong>Age</strong> — sources in order: manual age (read as the age at the earliest
          dated row), attributes-table birth date, birth date on the earliest dated lab row
          that carries one, stated ages. Each stated age defines a one-year interval of possible birth dates; the
          anchor is the midpoint of their intersection. Without a common birth date, the median of
          the interval midpoints is used.
        </li>
        <li>
          <strong>Reported as conflicts</strong> — differing sex codes, a tie, differing birth
          dates, stated ages contradicting the birth date or each other, implausible stated ages.
          A manual sex or age suppresses the corresponding reports.
        </li>
      </ul>

      <h4>AKI Detection (KDIGO Criteria)</h4>
      <p>
        AKI detection accepts serum creatinine in mg/dl or µmol/l; µmol/l values are divided by
        88.42 before KDIGO comparisons. Only dated exact numeric values are used. Values of zero or
        less are ignored. Creatinine measured under dialysis is ignored as well: from the start of
        a chronic dialysis until a later kidney transplant, and during an acute dialysis with a
        recorded end date, both boundary days included. Detection continues after
        transplantation. Dialysis of unknown intent and acute dialysis without an end date exclude
        nothing. Episodes are detected
        automatically using the KDIGO 2012 creatinine criteria; urine output is not evaluated:
      </p>
      <ul>
        <li>
          <strong>Absolute criterion</strong> — increase of ≥ 0.3 mg/dl within any 48-hour window.
        </li>
        <li>
          <strong>Relative criterion</strong> — increase to ≥ 1.5× the 7-day minimum
          baseline within any 7-day window.
        </li>
      </ul>
      <p>
        KDIGO thresholds use an inclusive 1e-12 numeric tolerance in the compared quantity
        (mg/dl for absolute values, unitless for ratios), so a rise exactly on a decimal boundary
        is not missed through floating-point rounding.
      </p>
      <p>AKI episodes are staged by the ratio of peak creatinine to the reference baseline:</p>
      <ul>
        <li>
          <strong>Stage I</strong> — rise ≥ 0.3 mg/dl or peak/baseline ≥ 1.5×, unless a higher stage
          applies.
        </li>
        <li>
          <strong>Stage II</strong> — peak/baseline ≥ 2.0× and &lt; 3.0×.
        </li>
        <li>
          <strong>Stage III</strong> — peak/baseline ≥ 3.0×, or absolute peak creatinine ≥ 4.0 mg/dl
          (the absolute peak override applies regardless of baseline ratio).
        </li>
      </ul>
      <p>
        The reference baseline is the <strong>lowest creatinine within the lookback window</strong>
        {' '}(48 h for the absolute criterion, 7 days for the relative criterion) — a pragmatic
        baseline for automated detection that maximises sensitivity.
      </p>
      <p>
        AKI chips in the patient table summarise detected stages as Roman numerals (e.g.{' '}
        <em>AKI I, II</em>). Individual episode markers and AKI windows can appear in individual
        patient charts and in the overlay when <em>AKI windows and episodes</em> is switched on.
        Grey open circles indicate values excluded from the active fit, so they remain visible even
        when AKI display is off.
      </p>
      <p><strong>Important limitations of AKI detection:</strong></p>
      <ul>
        <li>
          Detection uses the <strong>creatinine criterion only</strong>. The KDIGO{' '}
          <strong>urine-output criterion is not evaluated</strong> (urine data are not used), so
          oliguric AKI is not detected and AKI is <strong>undercounted</strong> relative to full
          KDIGO adjudication.
        </li>
        <li>
          Staging is by creatinine ratio / absolute level only. Renal replacement therapy does
          not raise the stage (KDIGO stage 3 by initiation of renal replacement therapy is not
          applied); creatinine values measured under dialysis are left out of detection as
          described above. Paediatric eGFR criteria are not considered.
        </li>
        <li>
          Episodes are detected automatically and are <strong>not clinician-adjudicated</strong>;
          treat the chips as a screening signal, not a diagnosis.
        </li>
        <li>
          The implemented thresholds are based on the KDIGO 2012 guideline. KDIGO has a newer AKI
          / AKD guideline draft under public review in 2026, so this reference should be rechecked
          before any regulated or clinical use.
        </li>
      </ul>

      <h4>AKI Timing, Episodes and the Fit-Exclusion Window</h4>
      <p>
        Lab dates are calendar days without a time of day. The 48-hour window therefore covers
        earlier measurements on the same date or one or two calendar days earlier, and the 7-day
        window those up to seven calendar days earlier, limits included. A rise from 1.0 to
        1.3 mg/dl two days apart is detected; three days apart it is not.
      </p>
      <p>
        Each measurement that meets a criterion is a crossing. Consecutive crossings form one
        episode only while they share the same baseline date; the onset is the date of the first
        crossing. An episode has no end date, so a sustained rise is reported as a chain of
        episodes: daily values of 1.0, 1.4, 1.8, 2.2, 2.6 and 3.0 mg/dl give four Stage I
        episodes.
      </p>
      <p>
        With AKI exclusion on, each episode removes from the fit all measurements from the onset
        date through onset + 30 days (default), both ends included: onset 2 January 2020 excludes
        2 January to 1 February 2020.
      </p>

      <h4>Cohort Screening</h4>
      <p>
        The patient table <strong>ranks and sorts</strong> patients by the selected metric (latest
        value, slope, absolute slope, number of values, or observation span), in either direction.
      </p>
      <p>
        For eGFR series it also applies a single, explicit clinical flag:{' '}
        <strong>rapid eGFR decline</strong>. An eGFR series whose fitted slope falls faster than the
        configured threshold is marked <span className="rapid-badge rapid-badge-inline">rapid ↓</span>{' '}
        in the table when the fit is shown, and carries a <code>rapid_progression</code> column in
        the export. The default threshold of <strong>5 mL/min/1.73m² per year</strong> is the
        number KDIGO uses for rapid CKD progression, which KDIGO defines as a sustained decline.
        The flag itself does not test whether a decline is sustained: it is set for any computed
        slope beyond the threshold, including one from two measurements or from a few weeks of
        follow-up. Read it together with the reliability note of the same cell. The
        threshold is adjustable under Trajectories → Display and analysis (set it to 0 to disable
        the flag). No other clinical
        cut-offs are applied; all other interpretation of the ranking is left to the user, and the
        flag itself is a screening signal, not a diagnosis.
      </p>

      <h4>Cohort Model Specification, Intervals and Projections</h4>
      <p>
        The cohort model is a linear mixed model of the measured value on time in years, with a
        random intercept and slope per patient by default, estimated by restricted maximum
        likelihood (REML). A “level” factor shifts the level; “level and slope” also adds an
        interaction with time. Numeric factors, including baseline age, are centred at their mean
        over the modelled patients, one value each. Categorical factors use treatment contrasts:
        each coefficient is the difference from the reference level. Fixed effects have 95% Wald
        intervals; no p-values are computed.
      </p>
      <p>
        The model line shows the reference profile — numeric factors at their centres,
        categorical factors at their reference levels — from fixed effects only, within observed
        model time.
      </p>
      <p>
        A projection is the time at which a profile&apos;s fixed-effect line reaches a threshold;
        it has no interval. It is reported only within the horizon (default 20 years, exactly 20
        included) and is withheld unless the fit converged, is not singular and matches the
        current data and settings.
      </p>
      </section>

      <section className="methodology-section" id="safety-sources">
        <h3>Safety &amp; Sources</h3>

      <h4>Intended Use</h4>
      <p>
        Lab Trajectory Explorer is a tool for <strong>research, transparency, and reproducibility</strong>.
        It is <strong>not a medical device and not for clinical decision-making</strong>, diagnosis,
        triage, or patient management. All derived values (slopes, eGFR, AKI episodes) are
        algorithmic estimates that require independent clinical verification.
      </p>

      <h4>Medical Sources</h4>
      <ul>
        <li>
          CKD-EPI 2021 creatinine equation:{' '}
          <ExternalSource href={SOURCES.ckdEpi2021}>
            National Kidney Foundation formula page
          </ExternalSource>{' '}
          and{' '}
          <ExternalSource href={SOURCES.niddkAdults}>
            NIDDK adult eGFR equations reference
          </ExternalSource>.
        </li>
        <li>
          MDRD-4 175-coefficient equation:{' '}
          <ExternalSource href={SOURCES.niddkPrevious}>
            NIDDK previous adult eGFR equations reference
          </ExternalSource>.
        </li>
        <li>
          EKFC 2021 creatinine equation:{' '}
          <ExternalSource href={SOURCES.ekfc2021}>
            Pottel et al., Annals of Internal Medicine 2021
          </ExternalSource>.
        </li>
        <li>
          AKI detection and staging thresholds:{' '}
          <ExternalSource href={SOURCES.kdigoAki2012}>
            KDIGO 2012 Clinical Practice Guideline for Acute Kidney Injury
          </ExternalSource>{' '}
          and the{' '}
          <ExternalSource href={SOURCES.kdigoAkiUpdate}>
            KDIGO AKI / AKD guideline update page
          </ExternalSource>.
        </li>
        <li>
          Rapid CKD progression threshold:{' '}
          <ExternalSource href={SOURCES.kdigoCkdProgression}>
            KDOQI US Commentary on the 2012 KDIGO CKD guideline
          </ExternalSource>.
        </li>
      </ul>
      </section>
    </article>
  )
}
