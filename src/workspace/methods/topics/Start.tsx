import type { HelpWorkspace } from '../method-navigation'

export function Start({ onNavigate }: { onNavigate?: (page: HelpWorkspace) => void }) { return <>
<p>Prepare your data, explore individual courses, then estimate population associations. Start with the workflow below or choose a topic in the navigation.</p><h3 id="methods-answers" tabIndex={-1}>Find an answer</h3><ul className="methodology-answers">
<li><a href="#methods/data/egfr">Why is an eGFR value missing?</a></li>
<li><a href="#methods/fits/choosing">Which fit model should I choose?</a></li>
<li><a href="#methods/endpoints/missing">Why is there no G5 projection?</a></li>
<li><a href="#methods/aki/timing">Which measurements does an AKI window exclude?</a></li>
<li><a href="#methods/cohort/specification">What does a cohort model projection mean?</a></li>
<li><a href="#methods/export">What is included in my export?</a></li></ul>
<h3 id="methods-workflow" tabIndex={-1}>Quick Guide</h3>        <ol className="methodology-steps">
          <li>
            <strong>Load or upload a workbook.</strong> Use the demo dataset or upload lab rows under
            Data, then open Trajectories to compare patients in the table or open one patient.
          </li>
          <li>
            <strong>Choose the parameters.</strong> Pick measured laboratory parameters under
            Trajectories, or derive eGFR under Data when creatinine plus demographics are available.
          </li>
          <li>
            <strong>Set the fit policy before interpreting slopes.</strong> Configure event censoring,
            AKI exclusions, time balancing, and the fit model under Trajectories → Display and
            analysis, shared or per parameter column. The same policy feeds plots, cohort summaries,
            and exports.
          </li>
          <li>
            <strong>Inspect individual and cohort views together.</strong> Use the individual patient
            view for event context and the patient table or overlay for ranking, grouping, and outlier
            review.
          </li>
          <li>
            <strong>Use Cohort models for population-level estimates.</strong> Fit the whole
            cohort or selected groups, then verify the model status and warnings before using the
            result as exploratory evidence.
          </li>
          <li>
            <strong>Export only after checking the active configuration.</strong> Exports use the
            visible series settings and include a disclaimer sheet for reproducibility.
          </li>
        </ol>
{onNavigate && <div className="methodology-workflow-actions" aria-label="Open an analysis workspace">
  {(['Data', 'Trajectories', 'Cohort models'] as const).map(page => <button key={page} type="button" onClick={() => onNavigate(page)}>Open {page}</button>)}
</div>}

</> }
