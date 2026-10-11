export function Trajectories() { return <>
<p>The patient table, individual view and overlay share your patient and parameter selection. Use the table to compare courses, then open a patient to inspect measurements and event context.</p><section className="methodology-section"><h3 id="methods-overlay" tabIndex={-1}>Cohort Overlay Plot</h3>

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
</section><section className="methodology-section"><h3 id="methods-events" tabIndex={-1}>Clinical Events and Exclusion Display</h3>

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
</section><section className="methodology-section"><h3 id="methods-screening" tabIndex={-1}>Cohort Screening</h3>

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
</section><p>For analysis settings, see <a href="#methods/fits">Fits &amp; slopes</a>. For event windows, see <a href="#methods/aki">AKI &amp; exclusions</a>.</p>
</> }
