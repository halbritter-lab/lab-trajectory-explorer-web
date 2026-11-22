export function Aki() { return <>
<p>Detected AKI episodes provide event context. Displaying an episode and excluding its measurements from a trend fit are separate settings.</p><section className="methodology-section"><h3 id="methods-detection" tabIndex={-1}>AKI Detection (KDIGO Criteria)</h3>

      <p>
        AKI detection accepts serum creatinine in mg/dl or µmol/l; µmol/l values are divided by
        88.42 before KDIGO comparisons. Creatinine from other materials is not used. A series
        counts as creatinine when its name contains “Kreatinin” or “Creatinin” and its unit is
        mg/dl or µmol/l. It is left out when the name points to another material: urine (for
        example “Kreatinin i.U.”, “U-Kreatinin”, “Sammelurin”), dialysate, ascites, pleural or
        another fluid, cerebrospinal fluid (“Liquor”, “CSF”) or a drain. Aspirate, seroma,
        secretions and lymph are recognised in their German spelling only (“Punktat”, “Serom”,
        “Sekret”, “Lymphe”). A single letter “U” in the name also counts as urine, except where
        “u.” stands for “und” between two blood materials (“Serum u. Plasma”) or in “vor u. nach”.
        The rule reads the parameter name. One LOINC rule is added to it at import: creatinine
        rows with the urine codes 2161-8 or 14683-7 become a parameter of their own, named with
        “(urine, LOINC …)”, and are left out as well. Every other creatinine name is treated as
        serum creatinine, so check the <em>Creatinine source</em> under Data.
      </p>
      <p>
        Only dated exact numeric values are used. Values of zero or
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
      <p>AKI episodes are staged by the ratio of creatinine to the lowest value of the previous 7 days:</p>
      <ul>
        <li>
          <strong>Stage I</strong> — ≥ 1.5× that lowest value, or ≥ 0.3 mg/dl above it, unless a
          higher stage applies.
        </li>
        <li>
          <strong>Stage II</strong> — ≥ 2.0× and &lt; 3.0× that lowest value.
        </li>
        <li>
          <strong>Stage III</strong> — ≥ 3.0× that lowest value, or creatinine ≥ 4.0 mg/dl
          (the absolute level applies regardless of the ratio).
        </li>
      </ul>
      <p>An episode gets the highest stage that any of its values reaches.</p>
      <p>
        Detection compares each value with the <strong>lowest creatinine within the lookback window</strong>
        {' '}(48 h for the absolute criterion, 7 days for the relative criterion). The stage always
        uses the lowest value of the previous 7 days. No earlier baseline is used, so an AKI that is
        already present at the first measurement, or a rise slower than 7 days, is not detected.
      </p>
      <p>
        AKI chips in the patient table summarise detected stages as Roman numerals (e.g.{' '}
        <em>AKI I, II</em>). Individual episode markers and AKI windows can appear in individual
        patient charts and in the overlay when <em>AKI windows and episodes</em> is switched on.
        Grey open circles indicate values excluded from the active fit, so they remain visible even
        when AKI display is off.
      </p>
      <p>
        Each parameter column shows the AKI episodes that apply to it. A serum creatinine column
        (mg/dl or µmol/l) shows the episodes detected in its own values. A computed eGFR column
        uses the creatinine series it was computed from. Every other column, including an imported
        eGFR and a creatinine column in another material or unit, uses the patient&apos;s serum
        creatinine series that has the largest number of dated exact values. Two columns of the
        same patient can therefore show different episodes.
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
        Lab dates are calendar days. The 48-hour window covers earlier measurements one or two
        calendar days earlier, and the 7-day window those up to seven calendar days earlier, limits
        included. A rise from 1.0 to 1.3 mg/dl two days apart is detected; three days apart it is
        not.
      </p>
      <p>
        Several creatinine values on one day are ordered by their time of day when the file gives
        one for each of them; an earlier value of the day can then be the baseline of a later one.
        The windows still count calendar days. Without a time of day the order within the day is
        unknown: these values are compared with values of earlier days only, not with each other,
        so a rise within that day is not detected on that day. The Data page states how many
        patient-days this concerns.
      </p>
      <p>
        Each measurement that meets a criterion is a crossing. Consecutive crossings form one
        episode only while they share the same baseline date; the onset is the date of the first
        crossing. An episode has no end date, so a sustained rise is reported as a chain of
        episodes: daily values of 1.0, 1.4, 1.8, 2.2, 2.6 and 3.0 mg/dl give four episodes,
        of stages I, II, II and III.
      </p>
      <p>
        With AKI exclusion on, each episode removes from the fit all measurements from the onset
        date through onset + 30 days (default), both ends included: onset 2 January 2020 excludes
        2 January to 1 February 2020. For an eGFR column, the same windows are also left out of
        the baseline of the 40% and 57% decline and of the G5 projection. Observed G4 and G5 still
        use every eligible measurement (see <a href="#methods/endpoints/observed">Endpoints</a>).
      </p>
</section>
</details>
</details>
</> }
