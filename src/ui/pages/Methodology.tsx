import type { ReactNode } from 'react'

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
            <strong>Load or upload a workbook.</strong> Use the demo dataset or upload lab rows, then
            select a patient for detail review or switch to the cohort view.
          </li>
          <li>
            <strong>Choose the active series.</strong> Pick measured laboratory parameters or enable
            computed eGFR when creatinine plus demographics are available.
          </li>
          <li>
            <strong>Set the fit policy before interpreting slopes.</strong> Configure event censoring,
            AKI exclusions, time balancing, and the fit model in the sidebar. The same policy feeds
            plots, cohort summaries, and exports.
          </li>
          <li>
            <strong>Inspect individual and cohort views together.</strong> Use the patient plot for
            event context and the cohort table or overlay for ranking, grouping, and outlier review.
          </li>
          <li>
            <strong>Open the cohort mixed model when an eGFR cohort is active.</strong> Fit the whole
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
        Each configured series has its own fit configuration. Presets such as general exploration,
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
          model is off. The exported slope table names the model in its{' '}
          <strong>fit_model</strong> column, so a slope can be traced back to how it was produced.
          See <em>Choosing a fit model</em> below.
        </li>
        <li>
          <strong>Endpoints</strong> — eGFR series can report total percent decline from baseline,
          observed CKD G5 after persistent eGFR &lt; 15 for at least 90 days, and projected age to
          CKD G5 when a declining fit and sufficient age data exist.
        </li>
        <li>
          <strong>Exports</strong> — patient and cohort slope exports use the same event and AKI
          filtering inputs as the visible plots. Measurement rows remain visible even when they are
          excluded from the configured fit.
        </li>
      </ul>

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
          extreme values. This is the only model whose output has been cross-checked against an
          external reference workflow (see the caveat below).
        </li>
        <li>
          <strong>Theil-Sen</strong> — the median of all pairwise slopes, which makes it insensitive
          to a minority of outlying points. Appropriate when isolated extreme values — an AKI spike,
          a suspected lab error, a single post-operative measurement — would tilt an OLS line, and
          you would rather not remove them by hand. It costs statistical efficiency when the data
          are in fact clean.
        </li>
        <li>
          <strong>Rolling OLS</strong> — a separate OLS fit inside a sliding window. Appropriate
          when the rate of change itself changes over the observation period and a single slope
          would average a fast phase together with a slow one. It describes a sequence of local
          slopes rather than one summary number, so it answers “when did the decline accelerate”
          better than “how fast is the decline”.
        </li>
        <li>
          <strong>Segmented OLS</strong> — separate OLS fits per segment, split at long measurement
          gaps or at configured events. Appropriate when a discrete event — transplantation, start
          of chronic dialysis, a treatment change — makes one slope across the whole record
          meaningless. Prefer censoring or exclusion when the event should remove data entirely;
          prefer segmentation when the periods on either side are both of interest.
        </li>
        <li>
          <strong>No fit</strong> — measurements only. Appropriate for acute review, where drawing a
          trend line through an unstable course would suggest a trajectory the data do not support.
        </li>
      </ul>
      <p>
        <strong>Caveat.</strong> External comparison against an established workflow has so far
        covered the OLS results only. The other models are implemented from their standard
        definitions but have not been cross-validated against an independent implementation. Treat
        their output as exploratory and verify before relying on it.
      </p>

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
        Event and AKI labels can be hidden while excluded measurement points still remain marked in
        red, because red points mean “excluded from the active fit,” not merely “episode label
        visible.” When point-connecting is disabled, connector lines and red exclusion segments are
        hidden, but the underlying measurements and excluded-point markers remain visible.
      </p>

      <h4>Cohort Overlay Plot</h4>
      <p>
        The cohort overlay is a spaghetti plot for one configured series across the selected
        patient scope. It can use age, calendar date, or years since each patient's baseline as the
        x-axis. A single click highlights a trajectory, hover temporarily activates it, and double
        click opens the patient detail view. Event and AKI labels are drawn only for the active
        trajectory to keep the cohort view readable.
      </p>
      <p>
        The <em>Connect data points</em> setting applies to the overlay as well as the detail and
        mini-graph views. Turning it off removes normal trajectory connectors and red excluded
        trajectory segments, while preserving all measured points and any red excluded-point
        markers.
      </p>

      <h4>Quality Flags</h4>
      <p>
        The reason field carries a quality flag when the slope is either uncomputable or of low
        confidence. The first two flags mean no slope was produced; the third is a caveat on an
        otherwise valid fit:
      </p>
      <ul>
        <li>
          <strong>no_numeric_values</strong> — the series contains no parseable numeric measurements
          for this patient, so no slope is produced.
        </li>
        <li>
          <strong>n_below_threshold</strong> — fewer than three numeric values are available (or
          remain after gap-splitting or after AKI-episode exclusion in aki-aware mode), so OLS
          cannot be fitted and no slope is produced.
        </li>
        <li>
          <strong>span_too_short</strong> — a slope is produced, but the numeric values span fewer
          than 365 days, so the trend is flagged as low-confidence over such a short observation
          window.
        </li>
      </ul>
      <p>
        These flags are shown, not only exported: the cohort table carries a badge on the affected
        cell (<span className="quality-badge">n &lt; 3</span>,{' '}
        <span className="quality-badge quality-badge-caveat">&lt; 1 yr</span>) and the patient
        detail plot repeats it beneath the chart, with the full explanation in the label. A dashed
        grey badge means no slope was produced at all; an amber one means a slope exists but should
        be treated as unstable.
      </p>
      <p>
        <strong>The displayed flag is broader than the reason field.</strong> A series of exactly
        two points is a case the reason codes do not cover: the fit falls back to the exact
        two-point slope and reports R² = 1 with no reason set, because two points always define a
        line perfectly. Over a span longer than a year such a row would otherwise carry no warning
        at all, while looking like the best-fitting series in the cohort. The badge and the{' '}
        <code>unstable_slope</code> export column therefore also test the measurement count
        directly, so both halves of the rule of thumb — fewer than three measurements, or under a
        year between the first and the last — are applied. The numeric{' '}
        <strong>reason</strong> field is left as it is, so it continues to match the reference
        implementation it is validated against.
      </p>

      <h4>Why an Endpoint Has No Value</h4>
      <p>
        When no projected age to CKD G5 can be computed, the cohort cell states the reason instead
        of staying empty, because an empty cell reads the same whether the patient is stable or the
        data are too thin:
      </p>
      <ul>
        <li>
          <strong>G5 unlikely</strong> — the fitted trend is flat or rising, so no age at G5 is
          projected. This describes the observed window only and is not a prognosis.
        </li>
        <li>
          <strong>G5 now</strong> — the latest eGFR is already below 15, but without a confirmed
          persistent period, so neither the observed endpoint nor a projection applies.
        </li>
        <li>
          <strong>G5 no age</strong> — no age is recorded for the latest measurement, so the
          projection has nothing to anchor to.
        </li>
        <li>
          <strong>G5 n &lt; 3</strong> and <strong>G5 &lt; 1 yr</strong> — the same stability
          thresholds as above, applied to the projection.
        </li>
      </ul>

      <h4>eGFR (Estimated Glomerular Filtration Rate)</h4>
      <p>
        eGFR is a computed series derived from serum creatinine and patient demographics. It is
        flagged with <strong>ƒ</strong> throughout the UI to distinguish it from directly measured
        values.
      </p>
      <ul>
        <li>
          <strong>CKD-EPI 2021</strong> (default) — race-free equation published by Inker et al.
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
          source. A value stored under the wrong unit would therefore yield a wrong eGFR.
        </li>
        <li>
          <strong>Sex</strong> — the equations use sex-specific coefficients for{' '}
          <em>m</em> (male) and <em>w</em> (female). For <em>d</em> (diverse / non-binary) there is
          no validated coefficient set, so the <strong>male coefficients are applied</strong>; such
          eGFR values may mis-estimate true GFR and should be interpreted with caution.
        </li>
      </ul>

      <h4>AKI Detection (KDIGO Criteria)</h4>
      <p>
        Acute Kidney Injury episodes are detected automatically on serum creatinine series (unit
        mg/dl) using the KDIGO 2012 creatinine criteria. Only creatinine-based criteria are
        implemented:
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
      <p>AKI episodes are staged by the ratio of peak creatinine to the reference baseline:</p>
      <ul>
        <li>
          <strong>Stage I</strong> — peak/baseline ≥ 1.5× and &lt; 2.0×.
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
        AKI chips in the cohort table summarise detected stages as Roman numerals (e.g.{' '}
        <em>AKI I, II</em>). Individual episode markers can appear in single-patient plots and in
        the cohort overlay when AKI display is enabled. Red measurement points indicate values
        excluded from the active fit, so they can remain visible even when AKI episode labels are
        hidden.
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
          Staging is by creatinine ratio / absolute level only; it does not consider renal
          replacement therapy or paediatric eGFR criteria.
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

      <h4>Cohort Screening</h4>
      <p>
        The cohort table <strong>ranks and sorts</strong> patients by the selected metric (slope,
        absolute slope, number of values, or observation span).
      </p>
      <p>
        For eGFR series it also applies a single, explicit clinical flag:{' '}
        <strong>rapid eGFR decline</strong>. An eGFR series whose fitted slope falls faster than the
        configured threshold (default <strong>5 mL/min/1.73m² per year</strong>, matching the KDIGO
        definition of rapid CKD progression as a sustained decline faster than 5 mL/min/1.73m²/yr)
        is marked <span className="rapid-badge rapid-badge-inline">rapid ↓</span>{' '}
        in the table and carries a <code>rapid_progression</code> column in the export. The
        threshold is adjustable in the sidebar (set it to 0 to disable the flag). No other clinical
        cut-offs are applied; all other interpretation of the ranking is left to the user, and the
        flag itself is a screening signal, not a diagnosis.
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
