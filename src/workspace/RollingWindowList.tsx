import type { RollingSummary } from '../core/cohort/screening'
import { formatDisplayDate, formatDisplayNumber } from '../core/format'

/** The fitted windows of a Rolling OLS column, one row per window: what the
 * count and the range of local slopes above it are made of. The export sheet
 * `rolling_windows` holds the same rows. */
export function RollingWindowList({ rolling, unit }: { rolling: RollingSummary; unit: string | null }) {
  if (!rolling.windows.length) return null
  return <details className="wt-rolling-windows">
    <summary>Show windows ({rolling.windows.length})</summary>
    <div className="wt-table-scroll"><table aria-label="Rolling OLS windows">
      <thead><tr><th>Window</th><th>Fitted measurements from</th><th>to</th><th>n</th><th>Slope ({unit ? `${unit}/` : '/'}year)</th></tr></thead>
      <tbody>{rolling.windows.map((window, i) => <tr key={i}>
        <td>{formatDisplayDate(window.start)} to {formatDisplayDate(window.end)}</td>
        <td>{formatDisplayDate(window.firstDate)}</td><td>{formatDisplayDate(window.lastDate)}</td>
        <td>{window.n}</td><td>{formatDisplayNumber(window.slope)}</td>
      </tr>)}</tbody>
    </table></div>
    <p className="wt-muted">Each window covers {rolling.windowDays} days and moves on by {rolling.stepDays} days; both boundary days count. The reported slope stays the global OLS slope.</p>
  </details>
}
