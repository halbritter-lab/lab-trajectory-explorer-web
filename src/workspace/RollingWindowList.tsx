import type { RollingSummary } from '../core/cohort/screening'
import { formatDisplayDate, formatFixedDecimals, MIN_SLOPE_DECIMALS } from '../core/format'
import { t } from '../i18n'

/** The fitted windows of a Rolling OLS column, one row per window: what the
 * count and the range of local slopes above it are made of. The export sheet
 * `rolling_windows` holds the same rows. Slopes are written with the decimals
 * of the column (`slopeDisplayDecimals`), like the summary line above. */
export function RollingWindowList({ rolling, unit, slopeDecimals = MIN_SLOPE_DECIMALS }: { rolling: RollingSummary; unit: string | null; slopeDecimals?: number }) {
  if (!rolling.windows.length) return null
  // Under time balancing a window is fitted on medians: n counts them, and the
  // two dates are the representative dates of the first and last median.
  const heading = rolling.timeBalancing === 'monthly-median' ? t('Monthly medians from') : rolling.timeBalancing === 'quarterly-median' ? t('Quarterly medians from') : t('Fitted measurements from')
  return <details className="wt-rolling-windows">
    <summary>{t('Show windows ({windows})', { windows: rolling.windows.length })}</summary>
    <div className="wt-table-scroll"><table aria-label={t('Rolling OLS windows')}>
      <thead><tr><th>{t('Window')}</th><th>{heading}</th><th>{t('to')}</th><th>{t('n')}</th><th>{t('Slope ({unit}/year)', { unit: unit ?? '' })}</th></tr></thead>
      <tbody>{rolling.windows.map((window, i) => <tr key={i}>
        <td>{t('{from} to {to}', { from: formatDisplayDate(window.start), to: formatDisplayDate(window.end) })}</td>
        <td>{formatDisplayDate(window.firstDate)}</td><td>{formatDisplayDate(window.lastDate)}</td>
        <td>{window.n}</td><td>{formatFixedDecimals(window.slope, slopeDecimals)}</td>
      </tr>)}</tbody>
    </table></div>
    <p className="wt-muted">{t('Each window covers {windowDays} days and moves on by {stepDays} days; both boundary days count.', { windowDays: rolling.windowDays, stepDays: rolling.stepDays })}{rolling.timeBalancing !== 'raw' && ` ${rolling.timeBalancing === 'monthly-median' ? t('Each fitted point is the median of one calendar month, dated to one of its measurement days: n counts medians, and a measurement outside the window bounds can enter through the median of its month.') : t('Each fitted point is the median of one calendar quarter, dated to one of its measurement days: n counts medians, and a measurement outside the window bounds can enter through the median of its quarter.')}`} {t('The reported slope stays the global OLS slope.')}</p>
  </details>
}
