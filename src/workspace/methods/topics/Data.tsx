import { R_FIRST_FIT_DOWNLOAD } from '../../../core/mixedModel/rRuntime'

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
          <strong>CKD-EPI 2009 (race-free)</strong> — creatinine equation published by Levey et al.
          (Annals of Internal Medicine 2009). It is offered so that results can be compared with
          analyses that use this equation. The published coefficient for Black race (× 1.159) is{' '}
          <strong>not applied</strong>, because the app records no race. For patients to whom that
          coefficient does not apply, the result equals the published equation. Used when the
          formula selector is set to <em>CKD-EPI 2009 (race-free)</em>.
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
          (age-specific up to 25 years, then 0.90 mg/dl for male and 0.70 mg/dl for female).
          The{' '}
          <a href="https://www.niddk.nih.gov/research-funding/research-programs/kidney-clinical-research-epidemiology/laboratory/glomerular-filtration-rate-equations/children-adolescents-young-adults" target="_blank" rel="noreferrer">NIDDK</a>{' '}
          notes that the EKFC creatinine equation was developed in a population of White European
          children and adults, has not yet been fully validated in diverse populations, rescales
          creatinine by a Q value for which no factors have been established for the United States,
          and does not meet recommendations for race-free equations.
        </li>
      </ul>
      <p>
        The four equations above are used from 18 years at the time of measurement. Under 18 the
        setting “Under 18 years” on the Data page decides; by default CKiD U25 is used where a
        height is available and EKFC 2021 otherwise; at 1 year, below the range of EKFC, only CKiD
        U25, with a height of the same day or interpolated between two heights at most 30 days
        away. No eGFR is computed below 1 year or when the
        age is missing. This series is{' '}
        <strong>not for clinical decision-making</strong>.
      </p>
      <p><strong>Inputs and assumptions:</strong></p>
      <ul>
        <li>
          <strong>Units</strong> — creatinine is expected in <em>mg/dl</em>. Values recorded in{' '}
          <em>µmol/l</em> are converted automatically (÷ 88.42); other units are not used as an eGFR
          source. A value stored under the wrong unit would therefore yield a wrong eGFR. The
          calculation reads one creatinine series per patient: one test name with one unit. It is
          the selected creatinine source; a patient without any serum creatinine in <em>mg/dl</em>
          uses their own <em>µmol/l</em> series instead when the selected source is in mg/dl. If
          that series is recorded in <em>µmol/l</em>, its values are converted. Other creatinine
          values of the same patient form a separate parameter and are not added to the series. The
          Data page lists such series under “Not used for this eGFR”.
          Creatinine from urine, dialysate or another body fluid is not used as an eGFR source
          either (see <a href="#methods/aki/detection">AKI detection</a> for how such series are
          recognised). If a saved session selects such a series, or a series in another unit, the
          Data page says so while a formula is selected, and computes no eGFR until another source
          or <em>Automatic</em> is chosen. The EKFC
          equation's own age-specific Q values for ages up to 25 are converted with the factor
          88.4; the difference changes an eGFR by at most about 0.03 mL/min/1.73 m².
        </li>
        <li>
          <strong>Plausibility warnings</strong> — the Data page warns when dated exact values of
          any serum creatinine series are above 25 mg/dl (2210.5 µmol/l), and when exact computed
          eGFR values in the preview under <em>3. Derive eGFR</em> are above 200 mL/min/1.73 m². A
          value of exactly 25 mg/dl or exactly 200 gives no warning. The usual cause is a µmol/l
          column labelled mg/dl. No value is changed or excluded. The warnings do not detect every
          wrong source: a urine series with an unrecognised name can stay below both limits.
          Imported eGFR series are not checked.
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
</section><section className="methodology-section"><h3 id="methods-network" tabIndex={-1}>Network access and local storage</h3>
      <p>
        Importing data, the Trajectories page, this Methods page and the exports make no network
        requests beyond loading the app and its bundled demo and template files from the address
        the app is served from.
      </p>
      <p>
        The first cohort model fit of a session loads the R runtime and R packages. They are
        served with the app from the same address ({R_FIRST_FIT_DOWNLOAD}, measured in November
        2026); no other server is contacted. These are downloads only; no measurements are sent.
        As with loading the app, the server that hosts it sees the IP address, the browser type
        and which files are requested.
      </p>
      <p>
        The app does not pseudonymise: patient IDs are shown, kept and exported as imported.
      </p>
      <p>
        “Remember on this device” on the Data page is off by default. When it is on, an
        unencrypted copy of the dataset is kept in this browser. The copy is removed when the app
        is next opened more than seven days after the last data change, or at once with “Clear
        saved data”; until then it stays on the device.
      </p>
</section><details className="methodology-calculations"><summary>Calculation details</summary>
<details className="methodology-detail"><summary>eGFR: Conditions, Age and Rounding</summary>
<section className="methodology-section"><h3 id="methods-rounding" tabIndex={-1}>eGFR: Conditions, Age and Rounding</h3>

      <p>
        A creatinine measurement yields an eGFR value only when it has a lab date and a numeric
        value, the creatinine is greater than 0 mg/dl after conversion, the patient&apos;s sex is
        resolved, and the age is known and an equation applies at that age (from 18 for the adult
        equations; from 1 under the setting “Under 18 years”). Otherwise no value is produced.
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
