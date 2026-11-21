import type { RollingSummary } from '../core/cohort/screening'
import { formatDisplayDate, formatDisplayNumber } from '../core/format'
import { fittedPointNoun } from './workspace-labels'

/** The fitted windows of a Rolling OLS column, one row per window: what the
 * count and the range of local slopes above it are made of. The export sheet
 * `rolling_windows` holds the same rows. */
export function RollingWindowList({ rolling, unit }: { rolling: RollingSummary; unit: string | null }) {
  if (!rolling.windows.length) return null
  // Under time balancing a window is fitted on medians: n counts them, and the
  // two dates are the representative dates of the first and last median.
  const noun = fittedPointNoun(rolling.timeBalancing)
  const period = rolling.timeBalancing === 'monthly-median' ? 'month' : 'quarter'
  const heading = `${noun[0].toUpperCase()}${noun.slice(1)}s from`
  return <details className="wt-rolling-windows">
    <summary>Show windows ({rolling.windows.length})</summary>
    <div className="wt-table-scroll"><table aria-label="Rolling OLS windows">
      <thead><tr><th>Window</th><th>{heading}</th><th>to</th><th>n</th><th>Slope ({unit ? `${unit}/` : '/'}year)</th></tr></thead>
      <tbody>{rolling.windows.map((window, i) => <tr key={i}>
        <td>{formatDisplayDate(window.start)} to {formatDisplayDate(window.end)}</td>
        <td>{formatDisplayDate(window.firstDate)}</td><td>{formatDisplayDate(window.lastDate)}</td>
        <td>{window.n}</td><td>{formatDisplayNumber(window.slope)}</td>
      </tr>)}</tbody>
    </table></div>
    <p className="wt-muted">Each window covers {rolling.windowDays} days and moves on by {rolling.stepDays} days; both boundary days count.{rolling.timeBalancing !== 'raw' && ` Each fitted point is the median of one calendar ${period}, dated to one of its measurement days: n counts medians, and a measurement outside the window bounds can enter through the median of its ${period}.`} The reported slope stays the global OLS slope.</p>
  </details>
}
