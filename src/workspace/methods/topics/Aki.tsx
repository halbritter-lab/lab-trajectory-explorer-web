export function Aki() { return <>
<p>Detected AKI episodes provide event context. Displaying an episode and excluding its measurements from a trend fit are separate settings.</p><section className="methodology-section"><h3 id="methods-detection" tabIndex={-1}>AKI Detection (KDIGO Criteria)</h3>

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
</section><details className="methodology-calculations"><summary>Calculation details</summary>
<details className="methodology-detail"><summary>AKI Timing, Episodes and the Fit-Exclusion Window</summary>
<section className="methodology-section"><h3 id="methods-timing" tabIndex={-1}>AKI Timing, Episodes and the Fit-Exclusion Window</h3>

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
</section>
</details>
</details>
</> }
