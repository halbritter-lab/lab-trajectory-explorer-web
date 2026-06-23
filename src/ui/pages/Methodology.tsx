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

      <h3>Slope Modes</h3>
      <p>
        Each configured series can be summarised with one of seven slope modes. The mode is applied
        per patient and per series (parameter name + unit pair). All slopes are expressed{' '}
        <strong>per year</strong> (the regression x-axis is time in fractional years), so a
        creatinine slope is in mg/dl per year and an eGFR slope is in mL/min/1.73m² per year — the
        usual convention for reporting renal function decline.
      </p>
      <ul>
        <li>
          <strong>global</strong> — single OLS fit over the whole series. One slope value is
          produced spanning the full observation window.
        </li>
        <li>
          <strong>gap-split</strong> — split at day-gaps larger than the configured threshold, then
          fit each segment independently with OLS. Useful when a series has a long interruption that
          would otherwise distort a single fit.
        </li>
        <li>
          <strong>rolling</strong> — sliding 730-day window stepped 180 days. Each window must
          contain at least three numeric values to produce a slope; windows outside the data range
          are skipped. The cohort-table slope shown for a rolling series is the overall (global) OLS
          slope; the rolling windows additionally yield the minimum, maximum, and variance of the
          per-window slopes as a measure of trend stability.
        </li>
        <li>
          <strong>global-robust</strong> — Theil-Sen median pairwise slope over the whole series.
          It is less sensitive to isolated outliers than OLS and reports a non-parametric slope
          interval.
        </li>
        <li>
          <strong>chronic-ckd</strong> — excludes the configured number of days after the first
          observed value in that series, then fits OLS on the remaining points. This approximates a
          chronic-slope view only when the first observation is a meaningful anchor; it is not a
          treatment-anchored trial endpoint unless the loaded data are aligned that way.
        </li>
        <li>
          <strong>aki-aware</strong> — KDIGO AKI episodes are detected on the patient's serum
          creatinine (mg/dl) series; for other analytes (such as computed eGFR) the creatinine
          series of the same patient is used as the episode source. All observations falling within
          the window [episode date, episode date + exclusion days] (default 30 days) are excluded,
          and a single OLS line is fitted over the remaining points.
        </li>
        <li>
          <strong>event-driven</strong> — splits the series at loaded annotation dates and fits OLS
          per segment. Cohort summaries surface the fittable segment with the largest absolute
          slope.
        </li>
      </ul>

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
          (NEJM 2021). Used when the formula selector is set to <em>CKD-EPI 2021</em>.
        </li>
        <li>
          <strong>MDRD-4</strong> — four-variable (IDMS-traceable) Modification of Diet in Renal
          Disease equation. Used when the formula selector is set to <em>MDRD-4</em>. The original
          Black-race correction factor is <strong>not applied</strong> (race-free, consistent with
          current guidance).
        </li>
        <li>
          <strong>EKFC 2021</strong> — creatinine-based European Kidney Function Consortium equation
          published by Pottel et al. It rescales creatinine by sex- and age-specific Q values
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
        mg/dl) using the KDIGO 2012 creatinine criteria:
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
        <em>AKI I, II</em>). Individual episode markers appear on the single-patient plot when the
        AKI overlay is enabled.
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
          guideline draft under public review, so this reference should be rechecked before any
          regulated or clinical use.
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
        definition of rapid CKD progression) is marked <span className="rapid-badge rapid-badge-inline">rapid ↓</span>{' '}
        in the table and carries a <code>rapid_progression</code> column in the export. The
        threshold is adjustable in the sidebar (set it to 0 to disable the flag). No other clinical
        cut-offs are applied; all other interpretation of the ranking is left to the user, and the
        flag itself is a screening signal, not a diagnosis.
      </p>

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
