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
    <article style={{ maxWidth: '720px', lineHeight: 1.6 }}>
      <h2>Methodology</h2>
      <p>
        This reference describes the statistical methods, quality flags, and derived series used in
        Lab Trajectory Explorer. It is provided for transparency and reproducibility only and is{' '}
        <strong>not for clinical decision-making</strong>.
      </p>

      <h3>Fit Pipeline</h3>
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
          model is off.
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

      <h3>Clinical Events and Exclusion Display</h3>
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

      <h3>Cohort Overlay Plot</h3>
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

      <h3>Quality Flags</h3>
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

      <h3>eGFR (Estimated Glomerular Filtration Rate)</h3>
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

      <h3>AKI Detection (KDIGO Criteria)</h3>
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

      <h3>Cohort Screening</h3>
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

      <h3>Medical Sources</h3>
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

      <h3>Intended Use</h3>
      <p>
        Lab Trajectory Explorer is a tool for <strong>research, transparency, and reproducibility</strong>.
        It is <strong>not a medical device and not for clinical decision-making</strong>, diagnosis,
        triage, or patient management. All derived values (slopes, eGFR, AKI episodes) are
        algorithmic estimates that require independent clinical verification.
      </p>
    </article>
  )
}
