import { ReferenceTable } from '../ReferenceTable'

export function Endpoints() { return <>
<p>Observed endpoints record events supported by measurements. A projection extrapolates a fitted trend; it does not establish an observed event.</p>
<p>G4 uses eGFR below 30 and G5 below 15 mL/min/1.73 m². A later low measurement confirms the event after the configured minimum interval (default 90 days). Event and confirmation dates remain distinct; recovery after confirmation is reported separately.</p>
<p>Endpoints use dated exact numeric eGFR measurements before kidney transplant or chronic dialysis, excluding complete acute dialysis intervals including their boundary dates. Unknown-intent dialysis and incomplete acute intervals do not censor endpoints. Values marked &lt; or &gt; are excluded; a value &gt;x with x at or above 30 (G4) or 15 (G5) only interrupts an unconfirmed G4 or G5 candidate. Time balancing does not change these endpoint inputs. AKI exclusion changes two of them: the baseline of the 40% and 57% decline and the fit of the G5 projection (see <a href="#methods/endpoints/observed">calculation details</a>). Kidney replacement therapy is reported separately; no future individual G5 crossing is projected after KRT.</p>
<section className="methodology-section"><h3 id="methods-missing" tabIndex={-1}>Why an Endpoint Has No Value</h3>

      <p>
        When no projected age to CKD G5 can be computed, the patient table cell states the reason instead
        of staying empty, because an empty cell reads the same whether the patient is stable or the
        data are too thin:
      </p>
<ReferenceTable label="Endpoint status explanations"><table><thead><tr><th>Status</th><th>Meaning</th><th>What to check</th></tr></thead><tbody><tr><th scope="row"><strong>G5 no fit</strong></th><td>no scalar slope is available, so the projection cannot be
          calculated: Trend is switched off for the parameter, its method is No fit, or the fit failed. This is distinct from a fitted trend that is flat or rising.</td><td>Check that Trend is switched on and the method is not No fit, then whether the endpoint-eligible measurements produce a fit.</td></tr><tr><th scope="row"><strong>G5 not projected</strong></th><td>no future age at G5 was computed. The badge states
          whether the endpoint fit is flat or rising, its slope confidence interval includes zero
          or is unavailable, or its crossing lies more than 20 years after the latest measurement
          used. A crossing at exactly 20 years is included. <strong>G5 not
          projected</strong> can also mean that the data contain a confirmed G5 event while the
          observed G5 endpoint is switched off; the badge says so, and the export gives the reason{' '}
          <code>observed_ckd_g5</code>. With the observed endpoint on, the CKD G5 badge with its
          dates is shown instead.</td><td>Read the badge reason, then review the trend, its confidence bounds and the projection horizon.</td></tr><tr><th scope="row"><strong>G5 now</strong></th><td>the fitted curve reaches 15 at or before the latest
          measurement, so no future crossing is projected. This does not establish an observed event.</td><td>Review observed G5 separately; a fitted crossing is not confirmation.</td></tr><tr><th scope="row"><strong>G5 no age</strong></th><td>no age is available for the latest eligible measurement,
          so the projection has nothing to anchor to.</td><td>Review demographics and age at the latest eligible measurement under Data.</td></tr><tr><th scope="row"><strong>G5 &lt; 3 dates</strong> and <strong>G5 &lt; 5 dates</strong></th><td>measurements on fewer than three
          different dates, or, with Theil–Sen, on three or four dates (export reason <code>theil_sen_insufficient_points</code>). The count refers to the measurements used for the projection: endpoint-eligible measurements, outside AKI windows when <em>Exclude AKI windows from fit</em> is on. It does not refer to the display-fit measurements. See <a href="#methods/fits/quality">fit quality flags</a> for the separate display-fit rules.</td><td>Check the number of measurement dates; display-fit counts can differ.</td></tr><tr><th scope="row"><strong>G5 &lt; 1 yr</strong></th><td>fewer than 365 days between the first and the latest
          measurement used for the projection.</td><td>Check the follow-up span.</td></tr><tr><th scope="row"><strong>G5 not projected after KRT</strong></th><td>kidney replacement therapy (KRT) has
          started and no G5 was confirmed before it. KRT here is the first dated kidney transplant or chronic dialysis; acute dialysis and dialysis of unknown intent do not count. No projection is made for the time after the start.</td><td>Review the kidney replacement therapy event and its date.</td></tr></tbody></table></ReferenceTable>
</section><details className="methodology-calculations"><summary>Calculation details</summary>
<details className="methodology-detail"><summary>Observed G4/G5 and confirmed decline event algorithms</summary>
<section className="methodology-section"><h3 id="methods-observed" tabIndex={-1}>Observed G4/G5 and confirmed decline event algorithms</h3>

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
        counting duplicate rows. When <em>Exclude AKI windows from fit</em> is on for the column, the
        baseline uses only measurements outside AKI windows, and its 90 days start at the first
        such measurement. If no measurement lies outside AKI windows, there is no baseline and no
        decline event. Observed G4 and G5, the total percent change and the values that start or
        confirm a decline use every eligible measurement, including those inside AKI windows. The
        reason: at high creatinine, ordinary variation can meet the AKI criterion, so a sustained
        G5 can lie inside AKI windows and is still counted. Decline candidates begin after this window so a baseline value
        cannot also be a candidate. A zero or negative baseline makes these events unavailable.
        Values at exactly 40% or 57% decline cross the respective boundary. They use the same
        minimum and 12-calendar-month maximum confirmation intervals, same-time conflict rule,
        and separate recovery evidence as G4/G5. The total first-to-latest percent change shown
        in the table is a different metric.</p>
      <p>The 57% threshold only approximates a doubling of serum creatinine, and the match depends
        on the equation. Below the equation&apos;s breakpoint the decline is smaller.</p>
</section>
</details><details className="methodology-detail"><summary>Individual endpoint projection algorithm</summary>
<section className="methodology-section"><h3 id="methods-prediction" tabIndex={-1}>Individual endpoint projection algorithm</h3>

      <p>Fit the same endpoint-eligible dated exact numeric measurements, including recovery after
        acute dialysis but excluding transplant and chronic dialysis dates onward, using global OLS
        or the selected Theil–Sen estimator. Time balancing does not affect this endpoint
        projection. When <em>Exclude AKI windows from fit</em> is on for the column, measurements
        inside AKI windows are not fitted. They also do not count for the minimum number of dates
        or the follow-up span, and the latest measurement is the latest one outside these windows.
        Rolling and segmented selections use global OLS for the scalar
        endpoint projection; no-fit disables it. With y(t) = a + b × t, crossing time is
        (target − a) / b, in years from the first measurement. Add the remaining time after the
        latest measurement to the age at that measurement. When the birth date is known, this is
        the exact age. Otherwise the age is known in completed years only; the projected age can
        then be up to one year too low. The table shows the projected age as a whole number marked
        as approximate in both cases; the export keeps the unrounded value. A confirmed G5 event
        takes precedence over projection, whether or not the
        observed G5 endpoint is displayed.</p>
      <p>The projection assumes that the fitted linear decline continues unchanged. It has no
        interval of its own. Because a projected age is reported only when the slope interval lies
        entirely below zero, the reported ages come from clearly declining series. A missing
        projected age does not mean a stable course.</p>
      <p>Require measurements on at least three different dates (five with Theil–Sen); several
        measurements on one day count as one date. Also require at least 365 days between the
        first and the latest measurement, a finite declining fit, a future crossing and an age at
        the latest measurement. Report a future
        crossing only within 20 years after the latest measurement used, including the
        boundary. The endpoint fit's slope confidence interval must have finite ordered bounds
        strictly below zero; missing bounds or an interval that includes zero withhold the
        crossing. With OLS and only three dates this interval is so wide that it almost always
        includes zero: for values 60, 50, 25 at years 0, 1, 2 the slope is −17.5 per year but its
        interval runs from −72.5 to 37.5, so no crossing is reported. In practice an OLS projection
        needs more than three dates. Example: eGFR 48, 44, 41, 36, 33 and 29 on 15 January of six
        consecutive years gives a slope of −3.80 per year with an interval from −4.10 to −3.50;
        the fitted line reaches 15 about 3.7 years after the latest measurement. The displayed
        slope interval may differ because it can use different prepared rows. New measurements
        can change this projection; they do not revoke a confirmed event.</p>
      <p>With Theil–Sen and one measurement on each of up to five dates, the bounds are the smallest
        and the largest pairwise slope. With three or four dates these bounds contain the true
        slope less often than 95% of the time (about 67% and 92%; about 98% with five). A Theil–Sen
        projection therefore requires five dates.</p>
</section>
</details>
</details>
</> }
