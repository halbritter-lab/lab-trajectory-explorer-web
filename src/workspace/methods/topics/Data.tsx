export function Data() { return <>
<p>Review imported measurements and demographics under Data. Select a creatinine source and eGFR formula, inspect the preview, then apply the calculation.</p><section className="methodology-section"><h3 id="methods-egfr" tabIndex={-1}>eGFR (Estimated Glomerular Filtration Rate)</h3>

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
          from one birth-date anchor per patient (see <a href="#methods/data/demographics">Resolving Sex and Age</a>). A
          stated age that contradicts the others is corrected rather than used, and the
          contradiction is reported. Ages shown and exported can therefore differ from the values
          in the source file, usually by a year, and the eGFR follows that correction.
        </li>
      </ul>
</section><details className="methodology-calculations"><summary>Calculation details</summary>
<details className="methodology-detail"><summary>eGFR: Conditions, Age and Rounding</summary>
<section className="methodology-section"><h3 id="methods-rounding" tabIndex={-1}>eGFR: Conditions, Age and Rounding</h3>

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
</section>
</details><details className="methodology-detail"><summary>Resolving Sex and Age</summary>
<section className="methodology-section"><h3 id="methods-demographics" tabIndex={-1}>Resolving Sex and Age</h3>

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
</section>
</details>
</details>
</> }
