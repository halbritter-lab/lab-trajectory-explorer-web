import { ReferenceTable } from '../ReferenceTable'

export function Cohort() { return <>
<p>Cohort models estimate population associations with linear mixed models (WebR / lme4). Fit the whole cohort or selected groups, then inspect status and warnings before interpreting coefficients or projections.</p><section className="methodology-section"><h3 id="methods-preparation" tabIndex={-1}>Inputs, time origin and fit safeguards</h3>
      <p>
        Cohort models prepare their measurements with the analysis settings Trajectories uses for
        the same parameter: its event censoring, AKI exclusion windows and time balancing. The
        Data preparation select on the Cohort models page changes the same settings; specialist
        presets create independent settings for the selected parameter. The trajectory's Trend
        activation switch does not disable cohort model preparation. With general exploration, the setting of a newly loaded dataset, nothing is
        excluded or aggregated. The Cohort models page states the settings in use. A separate
        checkbox, on by default, applies the event censoring and AKI windows; turning it off
        retains the eligible exact dated measurements inside those windows, while time balancing
        still applies. A parameter set to “No fit” supplies no model rows. The preview, each model
        status and the workbook record the selected policy and the number of measurements removed
        by the union of those windows. This count is taken before time balancing and
        missing-factor exclusions. Changing these settings, on either page, discards fitted
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
      </p></section><section className="methodology-section"><h3 id="methods-specification" tabIndex={-1}>Cohort Model Specification, Intervals and Projections</h3>

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
</section><h3>Check model status</h3><ReferenceTable label="Cohort model status"><table><thead><tr><th>Status</th><th>Meaning and what to check</th></tr></thead><tbody>
<tr><td>Insufficient repeated observations</td><td>Check the included patients and distinct measurement times against the safeguards above.</td></tr>
<tr><td>Singular fit</td><td>Coefficients can be inspected and exported, but model lines and projections are withheld. Review the random-effect structure.</td></tr>
<tr><td>Changed data or settings</td><td>Fit again with the current configuration before interpreting a projection.</td></tr></tbody></table></ReferenceTable>
</> }
