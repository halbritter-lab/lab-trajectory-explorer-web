import { Icon, ToolPopover, AnalysisDrawer, Hint } from './trajectory-ui/Controls'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { buildCohortRows, cohortCellFlags, type CohortCell } from '../core/cohort/screening'
import type { ColumnModuleSettings } from '../core/analysis/registry'
import { comparePatientIds, patientIdKey, type LabRow, type PatientId, type WertOperator } from '../core/types'
import { boundedShareLabel, slopeQualityLabel, THEIL_SEN_FEW_DATES_COVERAGE } from './labels/qualityLabels'
import { MIN_THEIL_SEN_PROJECTION_DATES } from '../core/endpoints/thresholdEndpoints'
import { workspaceSpecs, type WorkspaceData, type WorkspaceParameter } from './workspace-data'
import { seriesMerges } from '../core/domains/nephrology/seriesMergeModule'
import { WorkspaceExportActions } from './WorkspaceExports'
import { SeriesComparison } from './SeriesComparison'
import { DEFAULT_WORKSPACE_DISPLAY, drawnFitLines, OVERLAY_MODULES, WorkspacePlot, formatWorkspaceDate, formatWorkspaceNumber, type WorkspaceAxis, type WorkspaceDisplay } from './WorkspacePlot'
import { PatientMeasurementTable, eventText, eventsByDate } from './PatientMeasurementTable'
import { RollingWindowList } from './RollingWindowList'
import './trajectories-workspace.css'
import './trajectory-ui/trajectories-ui.css'
import { SPARK_SIZES, sparkWidth, WorkspaceSparkline, type SparkDomain, type SparkSize } from './WorkspaceSparkline'
import { countLabel, exclusionReasonLabel, fittedPointNoun, sexLabel } from './workspace-labels'
import { anchorRuleLabel, type AnchorSide } from '../core/cohort/anchorComparison'
import { measurementFitStatus } from './measurement-fit-status'
import { fitInclusionCaveat, openUnknownDialysisWarning, type FitInclusionCaveat } from './labels/fitInclusion'
import { krtSegmentText, slopeTierNote } from './labels/slopeTier'
import { doublingTimeText } from './labels/doublingTime'
import { akiRecoveryHours, akiRetrospectiveFall } from '../core/domains/nephrology/aki/akiModule'
import { akiCriterionLabel, akiEpisodeBaselineLabel, akiEpisodeDialysisLabel, akiEpisodeEndLabel, akiEpisodeRows, akiStageLabel } from './aki-episodes'
import type { ClinicalEvent } from '../core/events/events'
import { AKI_MODULE_ID } from '../core/domains/nephrology/aki/akiModule'
import { formatFixedDecimals, MIN_SLOPE_DECIMALS, slopeDisplayDecimals } from '../core/format'
import { QuietAnalysisSettings } from './trajectory-ui/AnalysisSettings'
import { ANALYSIS_CATALOG, endpointBadge, type WorkspaceFitSettings } from './workspace-analysis'
import { ENDPOINT_BADGE_IDS, ENDPOINT_BADGES, type EndpointBadgeId } from './labels/endpointLabels'
import { parameterKeyLabel } from './saved-settings'
import { useAppStore } from './state/store'
import { trajectoryColumnSettings } from './trajectory-ui/analysis'
import { AnalysisRecordDialog } from './AnalysisRecord'
import type { SettingControl } from './analysis-record'
import { ColumnActions } from './trajectory-ui/ColumnActions'
import { groupKey, groupRows, rowsWithGroupValue } from './trajectory-ui/grouping'
import { computedEgfrKey, missingEgfrNotes, type MissingEgfrNote } from './egfr-gaps'
import { formulaSwitchNote } from './egfr-switch'
import { egfrFormulaSwitches, type EgfrFormulaSwitch } from '../core/domains/nephrology/egfr/series'
import { compareSlopeCells, hasUncertainSlope, ROW_MARKS, rowMarkLabel, rowMarks, type RowMark } from './trajectory-ui/rowScreening'
import { attributeSortKey, parseAttributeSort, compareAttributeValues } from './trajectory-ui/attributes'

/** Sort keys are `${parameterKey}:${metric}`; parameter keys are JSON and may
 * themselves contain ':', so split at the last one. */
function parseSortKey(sort: string): { paramKey: string; metric: string } {
  const separator = sort.lastIndexOf(':')
  return separator >= 0
    ? { paramKey: sort.slice(0, separator), metric: sort.slice(separator + 1) || 'latest' }
    : { paramKey: sort, metric: 'latest' }
}

/** Default direction per metric: slopes ascending (steepest decline first),
 * everything else descending (largest first). The direction toggle reverses it. */
const metricAscendingByDefault = (metric: string) => metric === 'slope'
/** Patients per table page; the first is the smallest, the second the default. */
const TABLE_PAGE_SIZES = [25, 50, 100] as const
const NO_EVENTS: readonly ClinicalEvent[] = []
/** A phone-sized screen: the mark filters move into a toolbar menu there, so
 * the first charts stay on the first screen. */
const PHONE_QUERY = '(max-width: 600px)'
function usePhoneLayout(): boolean {
  const query = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(PHONE_QUERY) : undefined
  const [phone, setPhone] = useState(() => query()?.matches ?? false)
  useEffect(() => {
    const media = query()
    if (!media) return
    const update = () => setPhone(media.matches)
    update()
    media.addEventListener?.('change', update)
    return () => media.removeEventListener?.('change', update)
  }, [])
  return phone
}
/** The rapid-decline mark is a finding, not a warning about the value: its own icon,
 * for both levels ("rapid ↓" and the possible "rapid ↓?"). */
const flagIcon = (tone: string) => tone === 'aki' || tone === 'aki-window' ? 'event' : tone === 'rapid' || tone === 'rapid-possible' ? 'decline' : 'endpoint'

function CellSummary({
  cell,
  patientId,
  fit,
  columnSettings,
  events = NO_EVENTS,
  excludesAki = false,
  timeBalancing = 'raw',
  detailed = false,
  compact = false,
  minimal = false,
  warningIcons = true,
  slopeDecimals = MIN_SLOPE_DECIMALS,
  missing,
  latestOperator,
  formulaSwitches,
  hiddenEndpointBadges,
}: {
  cell: CohortCell
  patientId: PatientId
  fit: boolean
  /** The column's own module settings (e.g. its rapid-decline threshold). */
  columnSettings: ColumnModuleSettings
  /** The patient's clinical events, for the note on what the fit runs across. */
  events?: readonly ClinicalEvent[]
  /** The column leaves AKI windows out of its fit. */
  excludesAki?: boolean
  /** The column's aggregation: fitted points are then medians, not measurements. */
  timeBalancing?: WorkspaceFitSettings['timeBalancing']
  /** Patient view: the slope-quality explanation is shown as text, not hidden. */
  detailed?: boolean
  /** Table view: condenses fit counts and secondary disclosures into one compact block. */
  compact?: boolean
  minimal?: boolean
  warningIcons?: boolean
  /** Decimals of every slope and interval bound of this parameter, so a column
   * lines up and reads the same in the table and the patient view. */
  slopeDecimals?: number
  /** Why this cell of a computed parameter is empty (the eGFR of a patient without sex, for example). */
  missing?: MissingEgfrNote
  /** Operator of the latest dated numeric row: a bound ("<", ">") is shown
   * before the latest value, "latest <15" (display only, 2026-11-22). */
  latestOperator?: WertOperator
  /** The patient's changes of the eGFR equation, on the computed eGFR column only (issue #66). */
  formulaSwitches?: readonly EgfrFormulaSwitch[]
  /** Endpoint badges the table leaves out (view setting); the patient view shows all. */
  hiddenEndpointBadges?: ReadonlySet<string>
}) {
  const noValuesText = missing?.text ?? 'No numeric measurements with a date'
  const slopeNumber = (value: number, signed = false) => formatFixedDecimals(value, slopeDecimals, signed)
  const last = cell.points[cell.points.length - 1]
  const latestText = last && `${latestOperator === '<' || latestOperator === '>' ? latestOperator : ''}${formatWorkspaceNumber(last.value)}`
  const quality = slopeQualityLabel(cell)
  const qualityText = quality?.label === 'no values'
    ? 'No numeric measurements'
    : quality?.label === 'no fit values'
      ? 'No fitted measurements'
      : quality?.label === '< 1 yr'
        ? 'Follow-up < 1 year'
        : quality?.label === 'one date'
          ? 'All fitted measurements on one date'
          : quality?.label

  // cell.fitModel is the scalar estimator; rolling and segmented runs are OLS
  // fits whose path is recorded in cell.mode.
  const modelLabel = cell.fitModel === 'theil-sen'
    ? 'Theil–Sen'
    : cell.mode === 'rolling'
      ? 'Rolling OLS'
      : cell.mode === 'gap-split'
        ? 'Segmented OLS'
        : cell.fitModel === 'none'
          ? 'No fit'
          : 'OLS'

  const flags = cohortCellFlags(cell, patientId, columnSettings)
  const badge = (flag: (typeof flags)[number]) => !detailed && flag.tone === 'aki'
    ? <Hint key={flag.id} label={flag.label} icon="event" tone="aki" text="AKI">{flag.title}</Hint>
    : !detailed && warningIcons
    ? <Hint key={flag.id} label={flag.label} icon={flagIcon(flag.tone)} tone={flag.tone} text={flag.tone === 'rapid-possible' ? '?' : undefined}>{flag.title}</Hint>
    : <details key={flag.id} className="wt-badge-details"><summary className={`wt-badge wt-badge-${flag.tone}`} title={flag.title}>{flag.label}</summary><p>{flag.title}</p></details>
  const endpoint = endpointBadge(cell.endpoints, cell.points.length, hiddenEndpointBadges)
  const markedReasons = cell.pointExclusionReasons.map(reasons => reasons.filter(reason => cell.fitModel !== 'none' || reason === 'censored-value'))
  const markedCount = markedReasons.filter(reasons => reasons.length > 0).length
  const markedLabels = [...new Set(markedReasons.flat())].map(exclusionReasonLabel)
  // Shared by the full and the compact layout, so their wording cannot drift.
  const measurementCount = `${cell.nNumeric} ${cell.nNumeric === 1 ? 'measurement' : 'measurements'}`
  const slopeText = cell.fitModel === 'none'
    ? 'Fit model disabled'
    : Number.isFinite(cell.slope)
      ? `${modelLabel}: ${slopeNumber(cell.slope, true)} ${cell.einheit ?? ''}/year, R² ${formatWorkspaceNumber(cell.r2)}`
      : 'No fit available'
  const rollingTitle = cell.rolling && `Rolling OLS: an OLS fit in each ${cell.rolling.windowDays}-day window, moved in steps of ${cell.rolling.stepDays} days, with at least three ${fittedPointNoun(cell.rolling.timeBalancing)}s. The slope above is the global OLS slope; the short lines in the chart are the window fits.`
  const rollingText = cell.rolling && (cell.rolling.nWindows > 0
    ? `${cell.rolling.nWindows} ${cell.rolling.nWindows === 1 ? 'window' : 'windows'}, local slopes ${slopeNumber(cell.rolling.slopeMin)} to ${slopeNumber(cell.rolling.slopeMax)} ${cell.einheit ?? ''}/year`
    : `No ${cell.rolling.windowDays}-day window with three ${fittedPointNoun(cell.rolling.timeBalancing)}s; no local slopes`)
  const hasCi = Number.isFinite(cell.ciLow) && Number.isFinite(cell.ciHigh)
  // Below the date minimum of a Theil–Sen projection the bounds are not a 95%
  // interval (decided 2026-11-16). Several values on one date raise the point
  // count, not the date count; the bounds are then rank-based rather than the
  // full range and their coverage is not established, so the label stays and
  // the hint gives the coverage for the one-measurement-per-date case only.
  const slopeRange = cell.fitModel === 'theil-sen' && cell.nFittedDates < MIN_THEIL_SEN_PROJECTION_DATES
  const ciGeneral = 'Uncertainty in the estimated slope; not a prediction interval for future measurements'
  const rangeHint = `Not a 95% interval: the fit has fewer than ${MIN_THEIL_SEN_PROJECTION_DATES} distinct dates. ${THEIL_SEN_FEW_DATES_COVERAGE}.`
  const ciTitle = slopeRange ? `${rangeHint} ${ciGeneral}` : ciGeneral
  const ciText = `${slopeRange ? 'Slope range' : '95% slope CI'} [${slopeNumber(cell.ciLow)}, ${slopeNumber(cell.ciHigh)}] ${cell.einheit ?? ''}/year`
  const qualityLabel = quality && `${qualityText}${quality.caveat ? ', uncertain slope' : ''}`
  const excludedText = `${markedCount} excluded from the fit (${markedLabels.join(', ')})`
  const included = fit && last ? combinedCaveat(fitInclusionCaveat(cell, events), openUnknownDialysisWarning(cell)) : null
  // A slope fitted across a change of the eGFR equation (issue #66).
  const switched = fit && last ? formulaSwitchNote(cell, formulaSwitches) : null
  // 20 % or more of the fitted points are bounded values (issue #73).
  const bounded = fit && last ? boundedShareLabel({ ...cell, timeBalancing }) : null
  // Slope tier (decision `minfu`, 2026-11-22): reliable or estimable; an uncertain slope keeps its amber note.
  const tierNote = fit && last ? slopeTierNote(cell) : null
  const reliableBadge = tierNote?.tier === 'reliable'
    ? <span className="wt-badge wt-badge-reliable" title={tierNote.title} aria-label={`${tierNote.label}: ${tierNote.title}`}>{tierNote.short}</span>
    : null
  // The values after KRT the column includes, fitted as their own segment (decision `censor`, 2026-11-22).
  const segmentText = fit && last ? krtSegmentText(cell, slopeNumber) : null
  // A 95% interval with zero strictly inside: the direction of the change is
  // not established. A note only; the reliability rule and the flags ignore it.
  const zeroInside = fit && last && hasCi && !slopeRange && cell.ciLow < 0 && cell.ciHigh > 0
    ? { label: 'Interval includes 0', title: 'The 95% interval of this slope includes zero: the measurements do not establish whether the value rises or falls.' }
    : null
  // The count beside a slope is the fitted one whenever it differs from the raw count.
  const fittedCount = fit && Number.isFinite(cell.slope) && cell.nFitted !== cell.nNumeric
  // Under time balancing the fitted points are medians: say so in every layout,
  // or "2 fitted of 8" reads as six excluded measurements.
  const mediansText = timeBalancing === 'raw' ? null : `${cell.nFitted} ${timeBalancing === 'monthly-median' ? 'monthly' : 'quarterly'} ${cell.nFitted === 1 ? 'median' : 'medians'} fitted`
  const fittedText = mediansText ? `n=${cell.nNumeric}, ${mediansText}` : `${cell.nFitted} of ${cell.nNumeric} fitted`
  const slopeUnitText = `${cell.einheit ? `${cell.einheit}/` : '/'}yr`
  // Logarithmic column (issue #70): doubling or halving time from the fit on log values.
  const doubling = fit && last ? doublingTimeText(cell) : null
  const noAkiText = fit && last && excludesAki && !flags.some(flag => flag.moduleId === AKI_MODULE_ID)
    ? 'No AKI episode on the creatinine series this parameter uses, so nothing is excluded from this fit for AKI.'
    : null

  if (minimal && !detailed) {
    const visibleFlags = flags.filter(flag => fit || !flag.requiresFit)
    const showSlope = fit && last !== undefined && Number.isFinite(cell.slope)
    return <div className="pv-cell-minimal">
      <div className="pv-cell-values">
        {/* With a trend the slope is the cell's figure; the latest value steps back. */}
        {showSlope && <strong aria-label={slopeText} className="pv-cell-slope">{slopeNumber(cell.slope, true)} {slopeUnitText}</strong>}
        {showSlope && hasCi && <span className="pv-cell-ci" aria-label={ciText} title={ciTitle}>{slopeRange ? 'range' : '95% CI'} [{slopeNumber(cell.ciLow)}, {slopeNumber(cell.ciHigh)}]</span>}
        {doubling?.short && <span className={`pv-cell-doubling${doubling.uncertain ? ' wt-warning' : ''}`} data-testid="doubling-time" aria-label={doubling.long} title={doubling.long}>{doubling.short}{doubling.uncertain ? ' (uncertain)' : ''}</span>}
        {showSlope
          ? <span aria-label={`Latest value: ${latestText}`}>latest {latestText}</span>
          : <strong aria-label={last ? `Latest value: ${latestText}` : missing?.label ?? 'No numeric measurements with a date'}>{last ? latestText : '—'}</strong>}
        {last && <span aria-label={fittedCount ? mediansText ? `${measurementCount}, ${mediansText}` : `${cell.nFitted} fitted of ${measurementCount}` : measurementCount}>{fittedCount ? fittedText : `n=${cell.nNumeric}`}</span>}
        <div className="pv-cell-indicators">
          <Hint label={last ? 'Measurement details' : missing?.label ?? 'No numeric measurements'} text={!last && missing && !warningIcons ? missing.label : undefined}><p>{last ? `${measurementCount} · Latest ${formatWorkspaceDate(last.date)}` : missing?.text ?? 'No numeric measurements with a date are available for this parameter.'}</p>{fit && last && <><p>{slopeText}</p>{doubling && <p>{doubling.long}</p>}<p>{cell.nFitted} fitted over {cell.fittedSpanDays} days.</p>{hasCi && <p>{ciText}. {ciTitle}.{zeroInside ? ` ${zeroInside.title}` : ''}</p>}{rollingText && <p>{rollingText}</p>}{tierNote && <p>{tierNote.label}: {tierNote.title}</p>}{segmentText && <p>{segmentText}</p>}</>}</Hint>
          {fit && last && quality && <Hint label={qualityLabel!} icon={quality.caveat ? 'warning' : 'info'} tone={quality.caveat ? 'caution' : 'neutral'} text={warningIcons ? undefined : qualityText}>{quality.title}</Hint>}
          {reliableBadge}
          {included && <Hint label={included.label} icon="warning" tone="caution" text={warningIcons ? undefined : included.label}>{included.title}</Hint>}
          {switched && <Hint label={switched.label} icon="warning" tone="caution" text={warningIcons ? undefined : switched.label}>{switched.title}</Hint>}
          {bounded && <Hint label={bounded.label} icon="warning" tone="caution" text={warningIcons ? undefined : bounded.label}>{bounded.title}</Hint>}
          {/* Icon mode: a second "i" beside Measurement details would look the same; the sentence is in that hint. */}
          {zeroInside && !warningIcons && <Hint label={zeroInside.label} text={zeroInside.label}>{zeroInside.title}</Hint>}
          {visibleFlags.map(flag => <Hint key={flag.id} label={flag.label} icon={flagIcon(flag.tone)} tone={flag.tone} text={flag.tone === 'aki' ? 'AKI' : !warningIcons ? flag.label : flag.tone === 'rapid-possible' ? '?' : undefined}>{flag.title}</Hint>)}
          {endpoint && <Hint label={endpoint.label} icon="endpoint" tone="endpoint" text={warningIcons ? undefined : endpoint.label}>{endpoint.title}</Hint>}
          {markedCount > 0 && <Hint label="Excluded measurements" icon="excluded" text={warningIcons ? undefined : `${markedCount} excluded`}>{excludedText}</Hint>}
        </div>
      </div>
    </div>
  }

  if (compact && !detailed) {
    const hasSecondaryDetails = Boolean((fit && last && (cell.rolling || hasCi || quality || doubling || tierNote || segmentText)) || included || switched || bounded || endpoint || markedCount > 0)
    return <div className="wt-cell-summary wt-cell-summary-compact">
      <span className={last ? undefined : 'wt-muted'}>
        {!last
          ? noValuesText
          : fit
            ? `${measurementCount} (${mediansText ?? `${cell.nFitted} fitted`} over ${cell.fittedSpanDays} days), latest ${formatWorkspaceDate(last.date)}`
            : `${measurementCount}, latest ${formatWorkspaceDate(last.date)}`}
      </span>
      {fit && last && <>
        <span>{slopeText}</span>
        {doubling && <span data-testid="doubling-time" title={doubling.long}>{doubling.short ? `${doubling.short[0].toUpperCase()}${doubling.short.slice(1)}${doubling.uncertain ? ' (uncertain)' : ''}` : 'No doubling time'}</span>}
        {quality && (warningIcons ? <Hint label={qualityLabel!} icon={quality.caveat ? 'warning' : 'info'} tone={quality.caveat ? 'caution' : 'neutral'}>{quality.title}</Hint> : <span className={quality.caveat ? 'wt-warning' : 'wt-muted'} title={quality.title}>{qualityLabel}</span>)}
        {reliableBadge}
        {included && <Hint label={included.label} icon="warning" tone="caution" text={warningIcons ? undefined : included.label}>{included.title}</Hint>}
        {switched && <Hint label={switched.label} icon="warning" tone="caution" text={warningIcons ? undefined : switched.label}>{switched.title}</Hint>}
        {bounded && <Hint label={bounded.label} icon="warning" tone="caution" text={warningIcons ? undefined : bounded.label}>{bounded.title}</Hint>}
        {zeroInside && !warningIcons && <Hint label={zeroInside.label} text={zeroInside.label}>{zeroInside.title}</Hint>}
        {flags.filter(flag => flag.requiresFit).map(badge)}
      </>}
      {endpoint && (warningIcons ? <Hint label={endpoint.label} icon="endpoint" tone="endpoint">{endpoint.title}</Hint> : <span className="wt-badge wt-badge-endpoint" title={endpoint.title}>{endpoint.label}</span>)}
      {flags.filter(flag => !flag.requiresFit).map(badge)}
      {hasSecondaryDetails && <details className="wt-compact-details">
        <summary>Details</summary>
        {fit && last && rollingText && <p title={rollingTitle || undefined}>{rollingText}</p>}
        {fit && last && hasCi && <p title={ciTitle}>{ciText}</p>}
        {doubling && <p>{doubling.long}</p>}
        {zeroInside && <p>{zeroInside.label}: {zeroInside.title}</p>}
        {fit && last && hasCi && slopeRange && <p className="wt-muted">{rangeHint}</p>}
        {fit && last && quality && <p>{quality.title}</p>}
        {tierNote && <p>{tierNote.label}: {tierNote.title}</p>}
        {segmentText && <p data-testid="krt-segment">{segmentText}</p>}
        {included && <p>{included.label}. {included.title}</p>}
        {switched && <p>{switched.label}. {switched.title}</p>}
        {bounded && <p>{bounded.label}. {bounded.title}</p>}
        {endpoint && <><p>{endpoint.title}</p><a href="#methods/endpoints/missing">Endpoint results and missing projections</a></>}
        {markedCount > 0 && <p className="wt-muted">{excludedText}</p>}
      </details>}
    </div>
  }

  return <div className="wt-cell-summary">
    <span className={last ? undefined : 'wt-muted'}>{last ? `${measurementCount}, latest ${formatWorkspaceDate(last.date)}` : noValuesText}</span>
    {/* Without a dated measurement the fit lines would only repeat that there is nothing to fit. */}
    {fit && last && <>
      <span>{slopeText}</span>
      {rollingText && <span title={rollingTitle || undefined}>{rollingText}</span>}
      {detailed && cell.rolling && <RollingWindowList rolling={cell.rolling} unit={cell.einheit} slopeDecimals={slopeDecimals} />}
      {hasCi && <span title={ciTitle}>{ciText}</span>}
      {hasCi && slopeRange && <span className="wt-muted">{rangeHint}</span>}
      {doubling && <span data-testid="doubling-time" className={doubling.uncertain ? 'wt-warning' : undefined}>{doubling.long}</span>}
      <span>
        {mediansText
          ? `${mediansText} (${cell.nNumeric} ${cell.nNumeric === 1 ? 'measurement' : 'measurements'}) over ${cell.fittedSpanDays} days`
          : cell.nFitted !== cell.nNumeric
          ? `${cell.nFitted} fitted of ${cell.nNumeric} ${cell.nNumeric === 1 ? 'measurement' : 'measurements'} over ${cell.fittedSpanDays} days`
          : `${cell.nFitted} fitted ${cell.nFitted === 1 ? 'measurement' : 'measurements'} over ${cell.fittedSpanDays} days`}
      </span>
      {quality && (detailed
        ? <p role="note" className={`wt-quality-note ${quality.caveat ? 'wt-warning' : 'wt-muted'}`}><strong>{qualityLabel}</strong>: {quality.title}</p>
        : warningIcons ? <Hint label={qualityLabel!} icon={quality.caveat ? 'warning' : 'info'} tone={quality.caveat ? 'caution' : 'neutral'}>{quality.title}</Hint> : <>
          <span className={quality.caveat ? 'wt-warning' : 'wt-muted'} title={quality.title}>{qualityLabel}</span>
          {/* Tooltips are unreachable by keyboard and touch; the disclosure is not. */}
          <details className="wt-quality-details"><summary>{quality.caveat ? 'Why is the slope uncertain?' : 'Why is there no slope?'}</summary><p>{quality.title}</p></details>
        </>)}
      {tierNote && (detailed
        ? <p role="note" className="wt-quality-note wt-muted" data-testid="slope-tier"><strong>{tierNote.label}</strong>: {tierNote.title}</p>
        : reliableBadge)}
      {segmentText && <p role="note" className="wt-quality-note" data-testid="krt-segment">{segmentText}</p>}
      {included && (detailed
        ? <p role="note" className="wt-quality-note wt-warning"><strong>{included.label}</strong>: {included.title}</p>
        : <Hint label={included.label} icon="warning" tone="caution" text={warningIcons ? undefined : included.label}>{included.title}</Hint>)}
      {switched && (detailed
        ? <p role="note" className="wt-quality-note wt-warning" data-testid="formula-switch-note"><strong>{switched.label}</strong>: {switched.title}</p>
        : <Hint label={switched.label} icon="warning" tone="caution" text={warningIcons ? undefined : switched.label}>{switched.title}</Hint>)}
      {bounded && (detailed
        ? <p role="note" className="wt-quality-note wt-warning" data-testid="bounded-share"><strong>{bounded.label}</strong>: {bounded.title}</p>
        : <Hint label={bounded.label} icon="warning" tone="caution" text={warningIcons ? undefined : bounded.label}>{bounded.title}</Hint>)}
      {zeroInside && <p role="note" className="wt-quality-note wt-muted"><strong>{zeroInside.label}</strong>: {zeroInside.title}</p>}
      {detailed && noAkiText && <span className="wt-muted">{noAkiText}</span>}
      {cell.anchorComparison && <AnchorComparisonText comparison={cell.anchorComparison} unit={cell.einheit} fitModel={cell.fitModel} slopeNumber={slopeNumber} />}
      {flags.filter(flag => flag.requiresFit).map(badge)}
    </>}
    {endpoint && (!detailed && warningIcons ? <Hint label={endpoint.label} icon="endpoint" tone="endpoint">{endpoint.title}</Hint> : <><span className="wt-badge wt-badge-endpoint" title={endpoint.title}>{endpoint.label}</span><details><summary>Endpoint details</summary><p>{endpoint.title}</p><a href="#methods/endpoints/missing">Endpoint results and missing projections</a></details></>)}
    {flags.filter(flag => !flag.requiresFit).map(badge)}
    {markedCount > 0 && <span className="wt-muted">{excludedText}</span>}
  </div>
}

/** Both notes on what a fit runs across or leaves out, as one. */
function combinedCaveat(a: FitInclusionCaveat | null, b: FitInclusionCaveat | null): FitInclusionCaveat | null {
  if (!a || !b) return a ?? b
  return { label: `${a.label}; ${b.label}`, title: `${a.title} ${b.title}` }
}

/** The before/after comparison of a cell (issue #64), beside its slope. */
function AnchorComparisonText({ comparison, unit, fitModel, slopeNumber }: { comparison: NonNullable<CohortCell['anchorComparison']>; unit: string | null; fitModel: CohortCell['fitModel']; slopeNumber: (value: number, signed?: boolean) => string }) {
  const rule = anchorRuleLabel(comparison.settings.rule)
  const perYear = `${unit ?? ''}/year`
  if (!comparison.anchor) return <p role="note" className="wt-quality-note wt-muted" data-testid="anchor-comparison">Before/after {rule}: no matching event for this patient.</p>
  if (!comparison.before || !comparison.after) return null
  // As for the column's slope: Theil–Sen bounds on fewer than five dates are not a 95% interval.
  const interval = (value: AnchorSide) => {
    const range = `[${slopeNumber(value.ciLow)}, ${slopeNumber(value.ciHigh)}]`
    return fitModel === 'theil-sen' && value.nFittedDates < MIN_THEIL_SEN_PROJECTION_DATES ? `Theil–Sen bounds ${range}, not a 95% interval: ${countLabel(value.nFittedDates, 'date')}` : `95% CI ${range}`
  }
  const side = (name: string, value: AnchorSide) => `${name} ${Number.isFinite(value.slope) ? `${slopeNumber(value.slope, true)} ${perYear}` : 'no fit'} (${countLabel(value.nFitted, 'fitted point')} over ${value.fittedSpanDays} days${Number.isFinite(value.ciLow) && Number.isFinite(value.ciHigh) ? `, ${interval(value)}` : ''})`
  const hasCi = Number.isFinite(comparison.differenceCiLow) && Number.isFinite(comparison.differenceCiHigh)
  const window = comparison.settings.exclusionDays > 0 ? ` ${countLabel(comparison.windowIdx.length, 'measurement')} in the ${comparison.settings.exclusionDays}-day window after the anchor left out of the after slope.` : ''
  return <p role="note" className="wt-quality-note" data-testid="anchor-comparison"><strong>Before/after {rule} ({formatWorkspaceDate(comparison.anchor.date)})</strong>: {side('before', comparison.before)}; {side('after', comparison.after)}; difference after − before {Number.isFinite(comparison.difference) ? `${slopeNumber(comparison.difference, true)} ${perYear}${hasCi ? ` (95% CI [${slopeNumber(comparison.differenceCiLow)}, ${slopeNumber(comparison.differenceCiHigh)}])` : ''}` : 'not available'}. Measurements on the anchor date count as before.{window}</p>
}

export function TrajectoriesWorkspace({ data, requestedPatientId, active = true, onNavigate }: {
  data: WorkspaceData; requestedPatientId?: PatientId | null; active?: boolean
  /** Go to a control on another page, from the analysis record. */
  onNavigate?: (control: Exclude<SettingControl, { page: 'Trajectories' }>) => void
}) {
  const [openTool, setOpenTool] = useState<string | null>(null)
  const closeTool = () => setOpenTool(null)
  const toggleTool = (name: string) => setOpenTool(current => current === name ? null : name)
  // Choices saved with "Remember on this device" (see saved-settings.ts); the
  // storage restores them into the store before this page mounts.
  const [savedView] = useState(() => useAppStore.getState().trajectoryView)
  const [parameterKeys, setParameterKeys] = useState(() => {
    // Saved keys of a computed parameter the derivation does not produce right
    // now stay selected, as they do within a session.
    const saved = savedView.parameterKeys ?? []
    return saved.some(key => data.parameters.some(p => p.key === key)) ? saved : data.parameters.slice(0, 3).map(p => p.key)
  })
  const [draftKeys, setDraftKeys] = useState<string[] | null>(null)
  useEffect(() => {
    if (!active) { setOpenTool(null); setDraftKeys(null) }
  }, [active])
  const [parameterQuery, setParameterQuery] = useState('')
  const [query, setQuery] = useState('')
  const [tablePage, setTablePage] = useState(0)
  const [pageSize, setPageSize] = useState<(typeof TABLE_PAGE_SIZES)[number]>(TABLE_PAGE_SIZES[1])
  // Set by a page change so the next layout shows the top of the new page; 'focus'
  // also moves the focus there, for the controls below the table.
  const pageJump = useRef<false | 'scroll' | 'focus'>(false)
  const [markFilters, setMarkFilters] = useState<RowMark[]>([])
  // Sorting by slope: uncertain slopes after the reliable ones (decided 2026-11-21).
  const [uncertainLast, setUncertainLast] = useState(true)
  const [selected, setSelected] = useState<PatientId[]>([])
  const [selectedOnly, setSelectedOnly] = useState(false)
  const [groupByState, setGroupBy] = useState('')
  const [attributeKeys, setAttributeKeys] = useState<string[]>([])
  const [groupState, setGroup] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([])
  const changeGrouping = (attribute: string) => { setGroupBy(attribute); setGroup(''); setCollapsedGroups([]); setTablePage(0) }
  const [sort, setSortKey] = useState('id')
  const [sortReversed, setSortReversed] = useState(false)
  const setSort = (next: string) => { setSortKey(next); setSortReversed(false); setTablePage(0) }
  const [mode, setMode] = useState<'table' | 'overlay' | 'detail'>('table')
  const [patientId, setPatientId] = useState<PatientId | null>(null)
  const [returnMode, setReturnMode] = useState<'table' | 'overlay'>('table')
  const [axis, setAxis] = useState<WorkspaceAxis>(savedView.axis)
  const [scaleMode, setScaleMode] = useState<'shared' | 'zoom'>(savedView.scaleMode)
  const [chartSize, setChartSize] = useState<SparkSize>(savedView.chartSize)
  const [cellDetails, setCellDetails] = useState<'minimal' | 'full' | 'compact'>(savedView.cellDetails)
  const [warningIcons, setWarningIcons] = useState(savedView.warningIcons)
  // Endpoint badges left out of the table cells (decided 2026-11-22, `badges`); the export keeps all.
  const [hiddenEndpointBadges, setHiddenEndpointBadges] = useState<EndpointBadgeId[]>(savedView.hiddenEndpointBadges ?? [])
  const hiddenBadgeSet = useMemo(() => new Set<string>(hiddenEndpointBadges), [hiddenEndpointBadges])
  const [tableWidth, setTableWidth] = useState(0)
  const [attributeTableWidth, setAttributeTableWidth] = useState(0)
  const [highlight, setHighlight] = useState<PatientId | null>(null)
  const [display, setDisplay] = useState<WorkspaceDisplay>({ ...DEFAULT_WORKSPACE_DISPLAY, ...savedView.display })
  // Whether "Measurement points" was ever switched: from then on the switch
  // decides, also in a dense overlay. Kept with the view, so it holds after a reload.
  const [pointsChosen, setPointsChosen] = useState(savedView.pointsChosen === true)
  // Overlay charts that hide their points by the density rule right now.
  const [autoHiddenCharts, setAutoHiddenCharts] = useState<Record<string, boolean>>({})
  const reportPointsAutoHidden = useCallback((key: string, hidden: boolean) => setAutoHiddenCharts(previous => (previous[key] ?? false) === hidden ? previous : { ...previous, [key]: hidden }), [])
  const [fitKeys, setFitKeys] = useState<string[]>(savedView.fitKeys)
  const [trendKeys, setTrendKeys] = useState<string[]>(savedView.trendKeys)
  // Columns on a logarithmic value axis (issue #70); they also get the doubling time.
  const [logKeys, setLogKeys] = useState<string[]>(savedView.logKeys ?? [])
  // The view reaches the store, and with it the saved settings, only once it
  // differs from what the page mounted with: mounting alone writes nothing, so
  // it cannot replace stored settings with the page's defaults.
  const view = { parameterKeys, trendKeys, fitKeys, display, axis, scaleMode, chartSize, cellDetails, warningIcons, ...(pointsChosen ? { pointsChosen: true as const } : {}), ...(logKeys.length ? { logKeys } : {}), ...(hiddenEndpointBadges.length ? { hiddenEndpointBadges } : {}) }
  const viewJson = JSON.stringify(view)
  const [mountedViewJson] = useState(viewJson)
  const viewChanged = useRef(false)
  useEffect(() => {
    if (!viewChanged.current && viewJson === mountedViewJson) return
    viewChanged.current = true
    useAppStore.getState().setTrajectoryView(JSON.parse(viewJson) as typeof view)
  }, [viewJson, mountedViewJson])
  const trajectoryFitSettings = useAppStore(s => s.trajectoryFitSettings)
  const fitSettings = trajectoryFitSettings.shared
  const columnSettings = trajectoryFitSettings.columns
  const setFitSettings = (updater: WorkspaceFitSettings | ((previous: WorkspaceFitSettings) => WorkspaceFitSettings)) => {
    const current = useAppStore.getState().trajectoryFitSettings
    const nextShared = typeof updater === 'function' ? updater(current.shared) : updater
    useAppStore.getState().setTrajectoryFitSettings({ ...current, shared: nextShared })
  }
  const setColumnSettings = (updater: Record<string, WorkspaceFitSettings> | ((previous: Record<string, WorkspaceFitSettings>) => Record<string, WorkspaceFitSettings>)) => {
    const current = useAppStore.getState().trajectoryFitSettings
    const nextColumns = typeof updater === 'function' ? updater(current.columns) : updater
    useAppStore.getState().setTrajectoryFitSettings({ ...current, columns: nextColumns })
  }
  // The settings live in the shared store, where Cohort models read and can
  // change them too. This page is keyed by the dataset and unmounts only when
  // the dataset is replaced or cleared; the store resets them to the defaults
  // in the same step (replaceDataset, reset), so nothing is reset here.
  const [requestedSettingsScope, setSettingsScope] = useState('')
  const settingsScope = parameterKeys.includes(requestedSettingsScope) && data.parameters.some(p => p.key === requestedSettingsScope) ? requestedSettingsScope : ''
  // A no-fit setting (Acute review) leaves trendKeys and fitKeys alone: the fit
  // config already turns the analysis off, and the user's Trend and line choices
  // return with the next fit method, whichever page or control sets it.
  const changeSettings = (settings: WorkspaceFitSettings) => {
    if (settingsScope) setColumnSettings(previous => ({ ...previous, [settingsScope]: settings }))
    else setFitSettings(settings)
  }
  const changeParameterMethod = (key: string, model: WorkspaceFitSettings['fitModel']) => {
    const current = columnSettings[key] ?? fitSettings
    setColumnSettings(previous => ({ ...previous, [key]: { ...current, fitModel: model, presetId: 'custom' } }))
  }
  const resetColumnSettings = () => setColumnSettings(previous => {
    const next = { ...previous }
    delete next[settingsScope]
    return next
  })

  const workspaceElement = useRef<HTMLDivElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const pickerButton = useRef<HTMLButtonElement>(null)
  const tableScroller = useRef<HTMLDivElement>(null)
  const detailHeading = useRef<HTMLHeadingElement>(null)
  const personButtons = useRef(new Map<PatientId, HTMLButtonElement>())
  const originatingPerson = useRef<PatientId | null>(null)
  const parameterHeaders = useRef(new Map<string, HTMLTableCellElement>())
  const tablePosition = useRef({ left: 0, top: 0, restore: false })
  const knownParameters = useRef(new Map(data.parameters.map(parameter => [parameter.key, parameter])))
  /** Keys of every merged series seen in this session (issue #68), so a removed one is still known as merged. */
  const knownMerged = useRef(new Set<string>())
  const [parameterNotice, setParameterNotice] = useState('')
  useEffect(() => {
    const replacements = new Map<string, string>()
    // A computed column follows a change of the eGFR formula; a merged series
    // (issue #68) is derived too but never replaces another column or is replaced.
    for (const merge of seriesMerges(data.analysisSettings)) knownMerged.current.add(JSON.stringify([merge.name, merge.unit]))
    const computed = (parameter: WorkspaceParameter | undefined) => !!parameter?.derived && !knownMerged.current.has(parameter.key)
    const nextDerived = data.parameters.filter(parameter => parameter.derived)
    const nextComputed = data.parameters.filter(computed)
    for (const key of parameterKeys) {
      if (!data.parameters.some(parameter => parameter.key === key) && computed(knownParameters.current.get(key)) && nextComputed.length === 1) replacements.set(key, nextComputed[0].key)
    }
    if (replacements.size) {
      setParameterKeys(previous => [...new Set(previous.map(key => replacements.get(key) ?? key))])
      setFitKeys(previous => [...new Set(previous.map(key => replacements.get(key) ?? key))])
      setTrendKeys(previous => [...new Set(previous.map(key => replacements.get(key) ?? key))])
      setLogKeys(previous => [...new Set(previous.map(key => replacements.get(key) ?? key))])
      setColumnSettings(previous => {
        const next = { ...previous }
        for (const [oldKey, newKey] of replacements) {
          if (previous[oldKey] && !next[newKey]) next[newKey] = previous[oldKey]
          delete next[oldKey]
        }
        return next
      })
      setSettingsScope(previous => replacements.get(previous) ?? previous)
      setParameterNotice(`The selected eGFR derivation was updated to ${nextComputed[0].label}.`)
    } else {
      const added = nextDerived.filter(parameter => !knownParameters.current.has(parameter.key))
      if (added.length) {
        setParameterKeys(previous => [...new Set([...previous, ...added.map(parameter => parameter.key)])])
        setParameterNotice(`Added derived parameter: ${added.map(parameter => parameter.label).join(', ')}. Imported parameter selections are unchanged.`)
      }
    }
    for (const parameter of data.parameters) knownParameters.current.set(parameter.key, parameter)
  }, [data.parameters, data.analysisSettings, parameterKeys])
  const unavailable = parameterKeys.filter(key => !data.parameters.some(parameter => parameter.key === key)).map(key => knownParameters.current.get(key)?.label ?? parameterKeyLabel(key))
  const measurementsBySeries = useMemo(() => {
    const map = new Map<string, LabRow[]>()
    for (const row of data.rows) {
      const key = JSON.stringify([row.patientId, row.bezeichnung, row.einheit])
      const bucket = map.get(key) ?? []; bucket.push(row); map.set(key, bucket)
    }
    for (const rows of map.values()) rows.sort((a, b) => (a.labDatum?.getTime() ?? Infinity) - (b.labDatum?.getTime() ?? Infinity))
    return map
  }, [data.rows])
  const eventsByPatient = useMemo(() => {
    const map = new Map<string, ClinicalEvent[]>()
    for (const event of data.events) map.set(patientIdKey(event.patientId), [...(map.get(patientIdKey(event.patientId)) ?? []), event])
    return map
  }, [data.events])
  // Why a patient has no computed eGFR at all, for the empty cells of that column.
  const egfrKey = computedEgfrKey(data)
  const egfrNotes = useMemo(() => missingEgfrNotes(data), [data])
  const missingNote = (key: string, id: PatientId) => key === egfrKey ? egfrNotes.get(patientIdKey(id)) : undefined
  const egfrSwitches = useMemo(() => egfrFormulaSwitches(data.rows), [data.rows])
  const switchesFor = (key: string, id: PatientId) => key === egfrKey ? egfrSwitches.get(patientIdKey(id)) : undefined
  const akiEpisodes = useMemo(() => akiEpisodeRows(data.rows, data.events, akiRecoveryHours(data.analysisSettings), akiRetrospectiveFall(data.analysisSettings)), [data.rows, data.events, data.analysisSettings])
  const measurementsFor = (id: PatientId, cell: { bezeichnung: string; einheit: string | null }) => measurementsBySeries.get(JSON.stringify([id, cell.bezeichnung, cell.einheit])) ?? []
  // Root remounts this component only when rawRows identity changes. A derived
  // update can remove a parameter without discarding unrelated browser choices.
  const keys = useMemo(() => parameterKeys.filter(key => data.parameters.some(p => p.key === key)), [parameterKeys, data.parameters])
  const parameters = useMemo(() => keys.flatMap(key => data.parameters.filter(p => p.key === key)), [keys, data.parameters])
  // One derivation for the table and the workbook (issue #83).
  const columnExport = useMemo(() => trajectoryColumnSettings(trajectoryFitSettings, parameters, trendKeys), [trajectoryFitSettings, parameters, trendKeys])
  const fitConfigs = columnExport.fitConfigByParameterKey
  useEffect(() => {
    const { paramKey, metric } = parseSortKey(sort)
    if ((metric === 'slope' || metric === 'absSlope') && fitConfigs[paramKey]?.fitModel === 'none') setSort('id')
  }, [sort, fitConfigs])
  // Before/after comparison per column (issue #64): not part of the fit configuration.
  const anchorComparisons = columnExport.anchorComparisonByParameterKey
  const logColumns = useMemo(() => keys.filter(key => logKeys.includes(key)), [keys, logKeys])
  const logColumn = keys.map(key => logKeys.includes(key))
  const specs = useMemo(() => workspaceSpecs(data, keys, fitConfigs, anchorComparisons, logColumns), [data, keys, fitConfigs, anchorComparisons, logColumns])
  /** The parameters whose trend is calculated and shown. */
  const parameterKeySet = new Set(parameters.filter(parameter => trendKeys.includes(parameter.key) && fitConfigs[parameter.key].fitModel !== 'none').map(parameter => parameter.key))
  const cohort = useMemo(() => buildCohortRows(data.rows, data.patients.map(p => p.id), specs), [data.rows, data.patients, specs])
  // One number of decimals per parameter column, from every slope of the loaded
  // dataset: a search or filter does not change how a slope is written.
  const slopeDecimals = useMemo(() => specs.map((_, index) => slopeDisplayDecimals(cohort.map(row => row.cells[index].slope))), [cohort, specs])
  // A logarithmic column (issue #70) has a positive range: its smallest and
  // largest positive value, not widened to zero; equal ends span a factor of ten.
  const sparkDomains = useMemo(() => specs.map((spec, index): SparkDomain => {
    const log = spec.logTrend === true
    let min = Infinity, max = -Infinity, days = 0
    for (const row of cohort) {
      const cell = row.cells[index]
      const first = cell.points[0]?.date.getTime()
      for (const point of cell.points) { days = Math.max(days, (point.date.getTime() - first) / 86_400_000); if (!log || point.value > 0) { min = Math.min(min, point.value); max = Math.max(max, point.value) } }
      for (const line of drawnFitLines(cell, log)) for (const point of line) { if (Number.isFinite(point.value) && (!log || point.value > 0)) { min = Math.min(min, point.value); max = Math.max(max, point.value) } }
    }
    if (!Number.isFinite(min)) return log ? { min: 1, max: 10, days: days || 1 } : { min: 0, max: 1, days: 1 }
    if (log) return min === max ? { min: min / Math.sqrt(10), max: max * Math.sqrt(10), days } : { min, max, days }
    min = Math.min(0, min); max = Math.max(0, max)
    if (min === max) max = min + 1
    return { min, max, days }
  }), [cohort, specs])
  const attributes = useMemo(() => [...new Set(data.patients.flatMap(p => Object.keys(p.attributes)))].sort(), [data.patients])
  // An attributes import can remove the grouping attribute without remounting
  // this page: grouping and its filter then end, everywhere at once.
  const groupBy = attributes.includes(groupByState) ? groupByState : ''
  const group = groupBy ? groupState : ''
  const shownAttributes = attributeKeys.filter(attribute => attributes.includes(attribute))
  const attributeLabel = (attribute: string, value: string | undefined) => value?.trim() ? attribute === 'sex' ? sexLabel(value) : value : undefined
  const attributeSort = parseAttributeSort(sort)
  const patientById = useMemo(() => new Map(data.patients.map(patient => [patient.id, patient])), [data.patients])
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const groupValue = (id: PatientId) => data.patientAttributes[String(id)]?.[groupBy]
  const groupLabel = (value: string) => groupBy === 'sex' ? sexLabel(value) : value
  const groups = groupRows(data.patients, patient => groupValue(patient.id), groupLabel)
  const normalizedQuery = query.trim().toLocaleLowerCase()
  // What each patient can be filtered by: the marks of the shown cells and the event types.
  const marksByPatient = useMemo(() => {
    const columns = parameters.map(p => ({ fit: trendKeys.includes(p.key) && fitConfigs[p.key].fitModel !== 'none', settings: (columnSettings[p.key] ?? fitSettings).moduleSettings }))
    return new Map(cohort.map(row => [row.patientId, rowMarks(row, columns, eventsByPatient.get(patientIdKey(row.patientId)))]))
  }, [cohort, parameters, trendKeys, fitConfigs, columnSettings, fitSettings, eventsByPatient])
  // Search, group and selection give the scope the mark counts refer to; the
  // chosen marks then narrow it, and a patient must carry all of them.
  const scoped = cohort.filter(row => {
    const patient = patientById.get(row.patientId)
    return (!selectedOnly || selectedSet.has(row.patientId)) && (!group || groupKey(groupValue(row.patientId)) === group) && `${row.patientId} ${patient?.label ?? ''}`.toLocaleLowerCase().includes(normalizedQuery)
  })
  const markOptions = ROW_MARKS.map(mark => ({ mark, count: scoped.reduce((count, row) => count + Number(marksByPatient.get(row.patientId)?.has(mark) ?? false), 0) }))
    .filter(option => option.count > 0 || markFilters.includes(option.mark))
  const phoneLayout = usePhoneLayout()
  const toggleMark = (mark: RowMark) => { setMarkFilters(previous => previous.includes(mark) ? previous.filter(item => item !== mark) : [...previous, mark]); setTablePage(0) }
  const filtered = scoped.filter(row => markFilters.every(mark => marksByPatient.get(row.patientId)?.has(mark))).sort((a, b) => {
    if (sort === 'id') return comparePatientIds(a.patientId, b.patientId)
    if (sort === 'id:desc') return comparePatientIds(b.patientId, a.patientId)
    if (attributeSort) {
      const value = (id: PatientId) => attributeLabel(attributeSort.attribute, data.patientAttributes[String(id)]?.[attributeSort.attribute])
      return compareAttributeValues(value(a.patientId), value(b.patientId), attributeSort.ascending) || comparePatientIds(a.patientId, b.patientId)
    }
    const { paramKey, metric } = parseSortKey(sort)
    const index = keys.indexOf(paramKey)
    if (index < 0) return comparePatientIds(a.patientId, b.patientId)
    const cellA = a.cells[index]
    const cellB = b.cells[index]
    const ascending = metricAscendingByDefault(metric) !== sortReversed
    if (metric === 'slope' || metric === 'absSlope') {
      return compareSlopeCells(cellA, cellB, { absolute: metric === 'absSlope', ascending, uncertainLast }) || comparePatientIds(a.patientId, b.patientId)
    }
    let valA: number | undefined
    let valB: number | undefined

    if (metric === 'n') {
      valA = cellA?.nNumeric ?? 0
      valB = cellB?.nNumeric ?? 0
    } else if (metric === 'duration') {
      valA = cellA?.spanDays ?? 0
      valB = cellB?.spanDays ?? 0
    } else {
      valA = cellA?.points.at(-1)?.value
      valB = cellB?.points.at(-1)?.value
    }
    if (valA === undefined && valB === undefined) return comparePatientIds(a.patientId, b.patientId)
    if (valA === undefined) return 1
    if (valB === undefined) return -1
    const diff = ascending ? valA - valB : valB - valA
    return diff || comparePatientIds(a.patientId, b.patientId)
  })
  const groupedRows = groupBy ? groupRows(filtered, row => groupValue(row.patientId), groupLabel) : []
  const visible = groupBy ? rowsWithGroupValue(groupedRows) : filtered
  // The table charts share the width of the table region, so few parameter
  // columns give wide charts; the region is measured while the table is shown.
  const tableShown = mode === 'table' && visible.length > 0
  const attributeLayoutKey = JSON.stringify(shownAttributes)
  useLayoutEffect(() => {
    const scroller = tableScroller.current
    if (!tableShown || !scroller) return
    const attributeHeaders = [...scroller.querySelectorAll<HTMLElement>('thead .pv-attribute-column')]
    const measure = () => {
      setTableWidth(scroller.clientWidth)
      setAttributeTableWidth(Math.ceil(attributeHeaders.reduce((width, header) => width + header.getBoundingClientRect().width, 0)))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(scroller)
    attributeHeaders.forEach(header => observer.observe(header))
    return () => observer.disconnect()
  }, [tableShown, attributeLayoutKey])
  const chartWidth = sparkWidth(Math.max(0, tableWidth - attributeTableWidth), parameters.length, chartSize)
  // Rows of a collapsed group take no place on a page: the pages hold the
  // expanded rows only, and a collapsed group is one header row on every page.
  const collapsedKeys = groupBy ? collapsedGroups : []
  const pagedRows = collapsedKeys.length ? visible.filter(row => !collapsedKeys.includes(groupKey(groupValue(row.patientId)))) : visible
  const pageCount = Math.ceil(pagedRows.length / pageSize)
  const activeTablePage = Math.min(tablePage, Math.max(0, pageCount - 1))
  const tableRows = pagedRows.slice(activeTablePage * pageSize, (activeTablePage + 1) * pageSize)
  const pageGroups = groupBy ? groupRows(tableRows, row => groupValue(row.patientId), groupLabel) : []
  const tableGroups = groupBy
    ? groupedRows.flatMap(section => collapsedKeys.includes(section.key) ? [{ ...section, rows: [] }] : pageGroups.filter(pageSection => pageSection.key === section.key))
    : [{ key: 'all', label: '', value: null, rows: tableRows }]
  const selectableRows = tableRows
  const changePage = (page: number, from: 'top' | 'bottom' = 'top') => { pageJump.current = from === 'bottom' ? 'focus' : 'scroll'; setTablePage(page) }
  useLayoutEffect(() => {
    const scroller = tableScroller.current, jump = pageJump.current
    pageJump.current = false
    if (!jump || !scroller) return
    // Only when the top of the table is out of sight: a change from the bar above it moves nothing.
    const top = scroller.getBoundingClientRect().top
    if ((top < 0 || top > window.innerHeight) && typeof scroller.scrollIntoView === 'function') scroller.scrollIntoView({ block: 'start' })
    if (jump === 'focus') scroller.focus({ preventScroll: true })
  }, [activeTablePage, pageSize])
  const pageSelectedCount = selectableRows.reduce((count, row) => count + Number(selectedSet.has(row.patientId)), 0)
  const pagePatientIds = selectableRows.map(row => row.patientId)
  const zoomDomains = specs.map((_, index): SparkDomain => {
    const log = logColumn[index]
    // On a log axis the range and its padding are taken in log10 units.
    const unit = (value: number) => log ? Math.log10(value) : value
    let min = Infinity, max = -Infinity
    for (const row of visible) {
      for (const point of row.cells[index].points) if (!log || point.value > 0) { min = Math.min(min, unit(point.value)); max = Math.max(max, unit(point.value)) }
      if (fitKeys.includes(keys[index])) for (const line of drawnFitLines(row.cells[index], log)) for (const point of line) {
        if (Number.isFinite(unit(point.value))) { min = Math.min(min, unit(point.value)); max = Math.max(max, unit(point.value)) }
      }
    }
    if (!Number.isFinite(min)) return sparkDomains[index]
    const pad = (max - min || Math.abs(max) || 1) * .08
    return log ? { min: 10 ** (min - pad), max: 10 ** (max + pad), days: sparkDomains[index].days } : { min: min - pad, max: max + pad, days: sparkDomains[index].days }
  })
  const patientIds = visible.map(row => row.patientId)
  // A dense overlay hides the measurement points until the switch is used.
  // The density rule may hide points only while the switch is untouched; each
  // overlay chart decides from its own trajectories and reports back.
  const pointsAuto = mode === 'overlay' && !pointsChosen
  const pointsAutoHidden = pointsAuto && Object.values(autoHiddenCharts).some(Boolean)
  const activeSort = sort === 'id' || sort === 'id:desc' ? null : parseSortKey(sort)
  const activeMetric = activeSort && keys.includes(activeSort.paramKey) ? activeSort.metric : null
  const slopeSortIndex = activeSort && (activeMetric === 'slope' || activeMetric === 'absSlope') ? keys.indexOf(activeSort.paramKey) : -1
  const uncertainSorted = slopeSortIndex < 0 ? 0 : visible.reduce((count, row) => count + Number(hasUncertainSlope(row.cells[slopeSortIndex])), 0)
  const firstShown = activeTablePage * pageSize + 1
  const lastShown = Math.min((activeTablePage + 1) * pageSize, pagedRows.length)
  const collapsedRowCount = visible.length - pagedRows.length
  const sortAscending = activeMetric ? metricAscendingByDefault(activeMetric) !== sortReversed : true
  // A mark depends on the analysis settings, so a settings change in the patient
  // view can take the open patient out of "Show only". They stay open then, with
  // a note: switching to another patient unasked would also redirect the patient export.
  const keptOutsideMarks = mode === 'detail' && markFilters.length > 0 && !visible.some(row => row.patientId === patientId) ? scoped.find(row => row.patientId === patientId) : undefined
  const current = visible.find(row => row.patientId === patientId) ?? keptOutsideMarks ?? visible[0]
  const currentIndex = visible.findIndex(row => row.patientId === current?.patientId)
  const open = (id: PatientId) => {
    if (mode === 'table') {
      tablePosition.current = { left: tableScroller.current?.scrollLeft ?? 0, top: document.scrollingElement?.scrollTop ?? document.documentElement.scrollTop, restore: true }
      originatingPerson.current = id
    }
    const nextReturn = mode !== 'detail' ? mode : returnMode
    setReturnMode(nextReturn)
    setPatientId(id)
    setMode('detail')
    if (typeof window !== 'undefined' && window.history?.pushState) {
      window.history.pushState({ page: 'Trajectories', mode: 'detail', patientId: id, returnMode: nextReturn }, '')
    }
  }
  useLayoutEffect(() => {
    if (mode === 'detail') {
      detailHeading.current?.focus()
      return
    }
    if (mode !== 'table' || !tableScroller.current) return
    tableScroller.current.scrollLeft = tablePosition.current.left
    if (tablePosition.current.restore) {
      if (originatingPerson.current !== null) personButtons.current.get(originatingPerson.current)?.focus({ preventScroll: true })
      const page = document.scrollingElement ?? document.documentElement
      page.scrollTop = tablePosition.current.top
      tablePosition.current.restore = false
    }
  }, [mode])
  const jumpParameter = (key: string) => {
    const header = parameterHeaders.current.get(key), scroller = tableScroller.current
    if (!header || !scroller) return
    const stickyWidth = Array.from(scroller.querySelectorAll('thead th')).slice(0, 2).reduce((sum, element) => sum + element.getBoundingClientRect().width, 0)
    const headerRect = header.getBoundingClientRect()
    const scrollerRect = scroller.getBoundingClientRect()
    const idx = keys.indexOf(key)
    const delta = headerRect.width > 0
      ? headerRect.left - scrollerRect.left - stickyWidth
      : ((idx >= 0 ? (idx + 1) * 200 : 350))
    scroller.scrollLeft = Math.max(0, scroller.scrollLeft + delta)
    tablePosition.current.left = scroller.scrollLeft
  }
  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const state = event.state as { page?: string; mode?: 'table' | 'overlay' | 'detail'; patientId?: PatientId; returnMode?: 'table' | 'overlay' } | null
      // Other workspaces and help topics must not change this mounted view.
      if (state?.page !== 'Trajectories') return
      if (state?.mode === 'table' || state?.mode === 'overlay' || state?.mode === 'detail') {
        if (state.mode === 'table') tablePosition.current.restore = true
        if (state.mode === 'detail' && state.patientId !== undefined) {
          setPatientId(state.patientId)
        }
        if (state.returnMode) setReturnMode(state.returnMode)
        setMode(state.mode)
      } else if (state?.page === 'Trajectories') {
        tablePosition.current.restore = true
        setMode('table')
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])
  useEffect(() => {
    if (requestedPatientId === undefined || requestedPatientId === null) return
    setQuery(''); setGroup(''); setSelectedOnly(false); setMarkFilters([]); setPatientId(requestedPatientId); setReturnMode('table'); setMode('detail')
  }, [requestedPatientId])
  const closePicker = () => { dialog.current?.close?.(); setDraftKeys(null); pickerButton.current?.focus() }
  // The analysis record (issue #83) and the controls its entries lead to.
  const [recordOpen, setRecordOpen] = useState(false)
  useEffect(() => { if (!active) setRecordOpen(false) }, [active])
  const recordButton = useRef<HTMLButtonElement>(null)
  const closeRecord = () => { setRecordOpen(false); recordButton.current?.focus({ preventScroll: true }) }
  // Beside the export button; on a phone in the toolbar, like the mark filters,
  // so the first charts stay on the first screen.
  const recordToggle = <button type="button" ref={recordButton} className={phoneLayout ? 'pv-tool' : 'pv-defaults'} onClick={() => { closeTool(); setRecordOpen(true) }}>Analysis record</button>
  const changeFromRecord = (control: SettingControl, parameterKey?: string, label?: string) => {
    if (control.page !== 'Trajectories') { onNavigate?.(control); return }
    if (control.target === 'analysis') {
      setSettingsScope(parameterKey ?? ''); setOpenTool('analysis')
      // Open the calculation settings and move to the setting, once the drawer is shown.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const panel = document.querySelector<HTMLElement>('.pv-analysis-panel[open]')
        if (!panel || label === 'Analysis preset') return
        panel.querySelector<HTMLDetailsElement>('details.wt-advanced-settings')?.setAttribute('open', '')
        const target = [...panel.querySelectorAll<HTMLElement>('select, input')].find(element => element.getAttribute('aria-label') === label)
        target?.scrollIntoView({ block: 'center' })
        target?.focus({ preventScroll: true })
      }))
    }
    else if (control.target === 'parameters') { closeTool(); setParameterQuery(''); setDraftKeys([...keys]) }
    else if (control.target === 'trend' || control.target === 'log') {
      // The Trend switch and the log button are in the column header of the table.
      if (mode !== 'table') setMode('table')
      const selector = control.target === 'trend' ? 'input[aria-label^="Analyse trend:"]' : 'button[aria-label^="Logarithmic value axis:"]'
      requestAnimationFrame(() => {
        const header = parameterKey === undefined ? undefined : parameterHeaders.current.get(parameterKey)
        header?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        header?.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true })
      })
    }
    else {
      if (mode === 'detail') setMode('table')
      requestAnimationFrame(() => workspaceElement.current?.querySelector<HTMLSelectElement>('select[aria-label="Group by attribute"]')?.focus())
    }
  }
  const pickerOpen = active && draftKeys !== null
  useEffect(() => {
    if (!pickerOpen) return
    if (dialog.current && !dialog.current.open && typeof dialog.current.showModal === 'function') dialog.current.showModal()
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !event.isComposing) {
        event.preventDefault()
        closePicker()
      }
    }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [pickerOpen])
  const toggleTrend = (key: string) => setTrend(trendKeys.includes(key) ? trendKeys.filter(item => item !== key) : [...trendKeys, key])
  /** Set Trend for every parameter as a switch would: a parameter whose
   * Trend goes on also draws its line (one step to a visible result; the line
   * can be hidden again), one whose Trend goes off loses its line and a
   * slope sort on it. Used by the switch and by applied export settings. */
  const setTrend = (next: readonly string[]) => {
    const on = next.filter(key => !trendKeys.includes(key))
    const off = trendKeys.filter(key => !next.includes(key))
    setTrendKeys([...next])
    if (on.length || off.length) setFitKeys(previous => [...previous.filter(key => !off.includes(key)), ...on.filter(key => !previous.includes(key))])
    if (off.some(key => sort === `${key}:slope` || sort === `${key}:absSlope`)) setSort('id')
  }
  const parameterControls = (p: WorkspaceParameter) => {
    const settings = columnSettings[p.key] ?? fitSettings
    const analysed = parameterKeySet.has(p.key)
    return <div className="pv-param-controls" role="group" aria-label={`Analysis: ${p.label}`}>
      <label title="Analyse trend"><input type="checkbox" aria-label={`Analyse trend: ${p.label}`} checked={analysed} disabled={settings.fitModel === 'none'} onChange={() => toggleTrend(p.key)} /><span className="pv-trend-text">Trend</span></label>
      <select aria-label={`Trend method: ${p.label}`} title={`${columnSettings[p.key] ? 'This parameter only' : 'Shared defaults'}: trend method`} value={settings.fitModel} onChange={event => changeParameterMethod(p.key, event.target.value as WorkspaceFitSettings['fitModel'])}>
        <option value="ols">OLS</option><option value="theil-sen">Theil–Sen</option><option value="rolling-ols">Rolling OLS</option><option value="segmented-ols">Segmented OLS</option><option value="none">No fit</option>
      </select>
      <button type="button" className="pv-line-toggle" aria-label={`Show trend line: ${p.label}`} aria-pressed={analysed && fitKeys.includes(p.key)} disabled={!analysed} title={analysed ? 'Show or hide the fitted line; results stay calculated' : 'Enable trend analysis first'} onClick={() => setFitKeys(previous => previous.includes(p.key) ? previous.filter(key => key !== p.key) : [...previous, p.key])}><Icon name="eye" /></button>
      <button type="button" className="pv-log-toggle" aria-label={`Logarithmic value axis: ${p.label}`} aria-pressed={logKeys.includes(p.key)} title="Logarithmic value axis; with a trend, also the doubling or halving time from a fit on log values" onClick={() => setLogKeys(previous => previous.includes(p.key) ? previous.filter(key => key !== p.key) : [...previous, p.key])}>log</button>
      <button type="button" aria-label={`Analysis settings: ${p.label}`} title={`Configure ${p.label}`} className="pv-settings-button" onClick={() => { setSettingsScope(p.key); setOpenTool('analysis') }}><Icon name="view" /><span>Settings</span></button>
    </div>
  }
  const markButtons = <>
    {markOptions.map(({ mark, count }) => <button type="button" key={mark} className="pv-mark-filter" aria-pressed={markFilters.includes(mark)} aria-label={`${rowMarkLabel(mark)}: ${count} ${count === 1 ? 'patient' : 'patients'}`} onClick={() => toggleMark(mark)}>{rowMarkLabel(mark)}<span className="pv-count">{count}</span></button>)}
    {markFilters.length > 0 && <button type="button" className="pv-mark-clear" onClick={() => { setMarkFilters([]); setTablePage(0) }}>Show all</button>}
  </>
  if (!data.patients.length) return <section className="card"><h1>Patients and trajectories</h1><p>No data loaded yet. Import a CSV or Excel file, or load demo data under Data.</p></section>
    return <div className={`wt-workspace pv-explorer ${openTool === 'analysis' ? 'pv-panel-open' : ''}`} ref={workspaceElement}>
    <header className="pv-heading"><div><h1>Explore trajectories</h1><p>Follow the measurements. Explore the change.</p></div><span className="pv-dataset-name">{data.fileName}</span></header>
    {parameterNotice && <p className="notice" role="status">{parameterNotice}</p>}
    {unavailable.length > 0 && <p className="notice" role="status">Unavailable selected parameters: {unavailable.join(', ')}. The selection is retained; unavailable parameters are excluded from exports.</p>}
    <section className="pv-table-tools" aria-label="Trajectory tools">
      <div className="pv-viewbar">    <div className="wt-view-row"><div className="wt-view-switch" role="group" aria-label="View"><button aria-pressed={mode === 'table'} onClick={() => {
      if (mode !== 'table') {
        if (mode === 'detail') tablePosition.current.restore = true
        setMode('table')
        if (typeof window !== 'undefined' && window.history?.pushState) window.history.pushState({ page: 'Trajectories', mode: 'table' }, '')
      }
    }}>Table</button><button aria-pressed={mode === 'overlay'} onClick={() => {
      if (mode !== 'overlay') {
        setMode('overlay')
        if (typeof window !== 'undefined' && window.history?.pushState) window.history.pushState({ page: 'Trajectories', mode: 'overlay' }, '')
      }
    }}>Overlay</button><button aria-pressed={mode === 'detail'} disabled={!current} onClick={() => {
      if (mode !== 'detail' && current) open(current.patientId)
    }}>Individual patient</button></div></div>
<div className="pv-exports"><WorkspaceExportActions data={data} parameterKeys={keys} groupBy={groupBy} patientIds={keptOutsideMarks ? [keptOutsideMarks.patientId] : patientIds} cohortRows={keptOutsideMarks ? [keptOutsideMarks] : visible} fitConfigByParameterKey={fitConfigs} anchorComparisonByParameterKey={anchorComparisons} moduleSettingsByParameterKey={columnExport.moduleSettingsByParameterKey} columnSettingsByParameterKey={columnExport.columnSettingsByParameterKey} {...(mode === 'detail' && current ? { patientId: current.patientId,
        getCharts: () => [...(workspaceElement.current?.querySelectorAll<SVGSVGElement>('.wt-plot-card svg.wt-plot') ?? [])].map(svg => ({
          svg, title: `Patient ${current.patientId}: ${svg.closest('.wt-plot-card')?.querySelector('h3')?.textContent ?? 'Chart'}`,
        })) } : {})} />{!phoneLayout && recordToggle}<button type="button" className="pv-defaults" onClick={() => { setSettingsScope(''); setOpenTool('analysis') }}>General defaults</button></div></div>
      <div className="pv-toolbar">
        <label className="pv-search"><Icon name="search" /><input aria-label="Search patients" value={query} onChange={event => { setQuery(event.target.value); setTablePage(0) }} placeholder="Search patients…" /></label>
        <div className="pv-tool-group">
          <button ref={pickerButton} className="pv-tool" type="button" onClick={() => { closeTool(); setParameterQuery(''); setDraftKeys([...keys]) }}><Icon name="parameters" />Parameters<span className="pv-count">{parameters.length}</span></button>
          {mode === 'table' && attributes.length > 0 && <ToolPopover name="Attributes" icon="parameters" badge={shownAttributes.length} open={active && openTool === 'attributes'} onToggle={() => toggleTool('attributes')} onClose={closeTool}>
            <p className="pv-attribute-help">Show columns without changing patient order.</p>
            <div className="pv-attribute-options">{attributes.map(attribute => <label key={attribute}><input type="checkbox" aria-label={`Show attribute: ${attribute}`} checked={shownAttributes.includes(attribute)} onChange={event => setAttributeKeys(previous => event.target.checked ? [...previous, attribute] : previous.filter(key => key !== attribute))} />{attribute}</label>)}</div>
          </ToolPopover>}
          {mode !== 'detail' && attributes.length > 0 && <label className="pv-inline-field pv-group-by"><span>Group by</span><select aria-label="Group by attribute" value={groupBy} onChange={event => changeGrouping(event.target.value)}><option value="">No grouping</option>{attributes.map(attribute => <option key={attribute} value={attribute}>{attribute}</option>)}</select></label>}
          {groupBy && <label className="pv-inline-field"><span>Show</span><select aria-label="Filter group" value={group} onChange={event => { setGroup(event.target.value); setTablePage(0) }}><option value="">All groups</option>{groups.map(section => <option key={section.key} value={section.key}>{section.label}</option>)}</select></label>}
          {mode === 'table' && <div className="pv-zoom" role="group" aria-label="Chart size"><span className="pv-zoom-label" aria-hidden="true">Chart size</span>{(['small', 'medium', 'large'] as const).map(size => <button type="button" key={size} aria-pressed={chartSize === size} aria-label={`${size[0].toUpperCase() + size.slice(1)} charts`} onClick={() => setChartSize(size)}>{size === 'small' ? 'S' : size === 'medium' ? 'M' : 'L'}</button>)}</div>}
          {markOptions.length > 0 && phoneLayout && <ToolPopover name="Show only" icon="filter" badge={markFilters.length} open={active && openTool === 'marks'} onToggle={() => toggleTool('marks')} onClose={closeTool}>
            <div className="pv-mark-filters pv-mark-menu" role="group" aria-label="Show only patients with">{markButtons}</div>
          </ToolPopover>}
          {phoneLayout && recordToggle}
          <ToolPopover name="Display" icon="view" open={active && openTool === 'view'} onToggle={() => toggleTool('view')} onClose={closeTool}>
                  <label className="wt-scale-control">Value scale<select aria-label="Value scale" value={scaleMode} onChange={event => setScaleMode(event.target.value as 'shared' | 'zoom')}><option value="shared">Shared parameter scale</option><option value="zoom">Zoom to visible values</option></select><span className="wt-muted">{scaleMode === 'shared' ? 'Full-dataset range including zero, consistent across patients and views.' : 'Visible values only; small changes appear larger.'}</span></label>

            {mode === 'table' && <div className="pv-table-options"><div className="wt-toolbar"><label>Jump to parameter<select defaultValue="" onChange={event => { jumpParameter(event.target.value); event.target.value = '' }}><option value="" disabled>Jump to …</option>{parameters.map(parameter => <option key={parameter.key} value={parameter.key}>{parameter.label}</option>)}</select></label><label>Cell details<select aria-label="Cell details" value={cellDetails} onChange={event => setCellDetails(event.target.value as 'minimal' | 'full' | 'compact')}><option value="minimal">Minimal</option><option value="compact">Compact</option><option value="full">Full details</option></select></label><label>Warnings<select aria-label="Warning display" value={warningIcons ? 'icons' : 'text'} onChange={event => setWarningIcons(event.target.value === 'icons')}><option value="icons">Icons with tooltips</option><option value="text">Text badges</option></select></label><details className="pv-endpoint-badges"><summary>Endpoint badges{hiddenEndpointBadges.length ? ` (${ENDPOINT_BADGES.length - hiddenEndpointBadges.length} of ${ENDPOINT_BADGES.length})` : ''}</summary><p className="wt-muted">Which endpoint results the table cells show, if they are evaluated. Display only: the patient view and the export keep every result.</p>{ENDPOINT_BADGES.map(badge => <label key={badge.id}><input type="checkbox" checked={!hiddenBadgeSet.has(badge.id)} onChange={event => setHiddenEndpointBadges(previous => event.target.checked ? previous.filter(id => id !== badge.id) : ENDPOINT_BADGE_IDS.filter(id => id === badge.id || previous.includes(id)))} />{badge.label}</label>)}</details></div><label className="pv-table-events"><input type="checkbox" checked={display.events} onChange={event => setDisplay(previous => ({ ...previous, events: event.target.checked }))} />Events<span className="wt-muted">Dashed lines at event dates, shaded to the end date; the same switch as in the overlay and patient charts.</span></label></div>}
                {mode !== 'table' && <section className="card wt-control-grid" aria-label="Plot settings"><label>Time axis<select value={axis} onChange={event => setAxis(event.target.value as WorkspaceAxis)}><option value="baseline">Years since first measurement</option><option value="baselineDays">Days since first measurement</option><option value="calendar">Calendar date</option><option value="age">Age</option><option value="event">Years since event</option></select></label><label>Highlight patient<select value={highlight === null ? '' : String(patientIds.indexOf(highlight))} onChange={event => setHighlight(event.target.value === '' ? null : patientIds[Number(event.target.value)] ?? null)}><option value="">None</option>{patientIds.map((id, i) => <option key={String(id)} value={i}>{id}</option>)}</select></label><div className="wt-toolbar">{(['points', 'connect', 'events'] as const).map(key => <label key={key}><input type="checkbox" checked={key === 'points' && pointsAutoHidden ? false : display[key]} onChange={event => { if (key === 'points') setPointsChosen(true); setDisplay(previous => ({ ...previous, [key]: event.target.checked })) }} />{key === 'points' ? 'Measurement points' : key === 'connect' ? 'Connecting lines' : 'Events'}</label>)}{OVERLAY_MODULES.map(module => <label key={module.id}><input type="checkbox" checked={display[module.id] ?? false} onChange={event => setDisplay(previous => ({ ...previous, [module.id]: event.target.checked }))} />{module.presentation.toggleLabel}</label>)}</div></section>}

          </ToolPopover>
        </div>
      </div>
      <div className="pv-statusbar"><div className="pv-scope" role="status"><strong>{visible.length}</strong> patients<span className="pv-status-dot" />{scaleMode === 'shared' ? 'Shared scales' : 'Zoomed scales'}{groupBy && mode === 'table' && <span className="pv-group-summary"> · {groupedRows.length} {groupedRows.length === 1 ? 'group' : 'groups'} · sorted within groups</span>}{parameterKeySet.size > 0 ? <span> · Trend analysis: {parameterKeySet.size}</span> : parameters.some(p => (columnSettings[p.key] ?? fitSettings).fitModel !== 'none') && <span> · Tick “Trend” at a parameter to calculate slopes</span>}{uncertainSorted > 0 && <span className="pv-uncertain-note"> · {uncertainSorted} uncertain {uncertainSorted === 1 ? 'slope' : 'slopes'} {uncertainLast ? 'placed after the other slopes' : 'ranked among the other slopes'}</span>}</div>
        {uncertainSorted > 0 && <label className="pv-uncertain-toggle" title="Uncertain: fewer than three fitted measurement dates or less than one year of follow-up. Patients without a slope stay last."><input type="checkbox" checked={uncertainLast} onChange={event => { setUncertainLast(event.target.checked); setTablePage(0) }} />Uncertain slopes last</label>}
        {mode === 'table' && pagedRows.length > TABLE_PAGE_SIZES[0] && <nav className="wt-table-pages" aria-label="Patient table pages">
          {pageCount > 1 && <><button type="button" aria-label="Previous table page" disabled={activeTablePage === 0} onClick={() => changePage(activeTablePage - 1)}>Previous</button><span role="status"><span className="wt-page-long">Showing </span>{firstShown}–{lastShown} of {pagedRows.length}<span className="wt-page-long"> {pagedRows.length === 1 ? 'patient' : 'patients'}{collapsedRowCount > 0 ? ` (${collapsedRowCount} more in collapsed groups)` : ''}</span></span><button type="button" aria-label="Next table page" disabled={activeTablePage >= pageCount - 1} onClick={() => changePage(activeTablePage + 1)}>Next</button>
            <label className="wt-page-option">Page<select aria-label="Go to page" value={activeTablePage} onChange={event => changePage(Number(event.target.value))}>{Array.from({ length: pageCount }, (_, page) => <option key={page} value={page}>{page + 1}</option>)}</select>of {pageCount}</label></>}
          <label className="wt-page-option">Per page<select aria-label="Patients per page" value={pageSize} onChange={event => { pageJump.current = 'scroll'; setPageSize(Number(event.target.value) as (typeof TABLE_PAGE_SIZES)[number]); setTablePage(0) }}>{TABLE_PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}</select></label>
        </nav>}</div>
      {markOptions.length > 0 && !phoneLayout && <div className="pv-mark-filters" role="group" aria-label="Show only patients with"><span aria-hidden="true">Show only</span>{markButtons}</div>}
      {(query || groupBy || group || selectedOnly || selected.length > 0 || markFilters.length > 0 || attributeSort && !shownAttributes.includes(attributeSort.attribute)) && <div className="pv-active-state">
        {groupBy && <button type="button" className="pv-chip" aria-label={`Remove grouping: ${groupBy}`} onClick={() => changeGrouping('')}>Grouped by: {groupBy}<Icon name="close" /></button>}
        {attributeSort && !shownAttributes.includes(attributeSort.attribute) && <button type="button" className="pv-chip" aria-label={`Clear attribute sort: ${attributeSort.attribute}`} onClick={() => setSort('id')}>Sort: {attributeSort.attribute} {attributeSort.ascending ? '↑' : '↓'}<Icon name="close" /></button>}
        {query && <button type="button" className="pv-chip" onClick={() => setQuery('')}>Search: {query}<Icon name="close" /></button>}
        {group && <button type="button" className="pv-chip" onClick={() => setGroup('')}>{groupBy}: {groups.find(section => section.key === group)?.label}<Icon name="close" /></button>}
        {selectedOnly && <button type="button" className="pv-chip" onClick={() => setSelectedOnly(false)}>Selected only<Icon name="close" /></button>}
        {selected.length > 0 && <><span>{selected.length} selected</span><label><input type="checkbox" checked={selectedOnly} onChange={event => { setSelectedOnly(event.target.checked); setTablePage(0) }} /> Selected only</label></>}
        {/* Offered before anything is selected once a search or filter narrows the table: the header checkbox reaches one page only. */}
        {(selected.length > 0 || query.trim() !== '' || group !== '' || markFilters.length > 0) && visible.length > 0 && <button type="button" onClick={() => setSelected(previous => [...new Set([...previous, ...patientIds])])}>Select all {visible.length} matching</button>}
        {selected.length > 0 && <button type="button" onClick={() => setSelected([])}>Clear selection</button>}
      </div>}
    </section>
    {!visible.length && !keptOutsideMarks && <p className="card">No matching patients. Change the search, group filter, “Show only” marks, or selection.</p>}
    {!parameters.length && <p className="card">Select at least one parameter.</p>}

    {mode === 'table' && visible.length > 0 && <div ref={tableScroller} onScroll={event => { tablePosition.current.left = event.currentTarget.scrollLeft }} className="wt-table-scroll" tabIndex={0} role="region" aria-label="Patient table, horizontal scrolling"><table className="wt-table" style={{ '--wt-chart-width': `${chartWidth}px` } as CSSProperties}><thead><tr><th title="Selection"><span className="sr-only">Selection</span><input type="checkbox" aria-label="Select visible patients on this page" title="Select visible patients on this page" disabled={!selectableRows.length} ref={element => { if (element) { element.indeterminate = pageSelectedCount > 0 && pageSelectedCount < selectableRows.length } }} checked={selectableRows.length > 0 && pageSelectedCount === selectableRows.length} onChange={event => { const scopeIds = new Set(pagePatientIds); setSelected(event.target.checked ? [...new Set([...selected, ...pagePatientIds])] : selected.filter(id => !scopeIds.has(id))) }} /></th><th aria-label="Patient" aria-sort={sort === 'id' ? 'ascending' : sort === 'id:desc' ? 'descending' : undefined}><ColumnActions active={active} label="Patient" shortLabel="ID" metrics={[{id:'id',label:'Patient ID'}]} activeMetric={sort === 'id' || sort === 'id:desc' ? 'id' : null} ascending={sort === 'id'} onSort={(_metric, ascending) => setSort(ascending ? 'id' : 'id:desc')} /></th>{shownAttributes.map(attribute => {
      const sortedAttribute = attributeSort?.attribute === attribute
      return <th className="pv-attribute-column" key={`attribute:${attribute}`} aria-label={`Attribute: ${attribute}`} aria-sort={sortedAttribute ? attributeSort.ascending ? 'ascending' : 'descending' : undefined}>
        <ColumnActions active={active} label={attribute} shortLabel={attribute} metrics={[{ id: 'value', label: 'Value' }]} activeMetric={sortedAttribute ? 'value' : null} ascending={attributeSort?.ascending ?? true} defaultAscending grouping={{ active: groupBy === attribute, onToggle: () => changeGrouping(groupBy === attribute ? '' : attribute) }} onSort={(_metric, ascending) => setSort(attributeSortKey(attribute, ascending))} />
      </th>
    })}{parameters.map(p => {
      const parsedSort = parseSortKey(sort)
      const metric = parsedSort.paramKey === p.key ? parsedSort.metric : null
      const settings = columnSettings[p.key] ?? fitSettings
      const analysed = parameterKeySet.has(p.key)
      return <th key={p.key} aria-label={p.derived ? `${p.label} (derived)` : p.label} aria-sort={metric ? sortAscending ? 'ascending' : 'descending' : undefined} ref={element => { if (element) parameterHeaders.current.set(p.key, element); else parameterHeaders.current.delete(p.key) }}>
        <ColumnActions active={active} label={p.label} activeMetric={metric} ascending={sortAscending} metrics={[
          { id: 'latest', label: 'Latest value' },
          { id: 'slope', label: 'Slope', disabled: !analysed },
          { id: 'absSlope', label: 'Absolute slope', disabled: !analysed },
          { id: 'n', label: 'Measurements' },
          { id: 'duration', label: 'Follow-up' },
        ]} onSort={(nextMetric, ascending) => { setSort(`${p.key}:${nextMetric}`); setSortReversed(metricAscendingByDefault(nextMetric) !== ascending) }}>
          {parameterControls(p)}
          <span className={`pv-own-profile ${!columnSettings[p.key] && settings.presetId === 'general_exploration' ? 'pv-default-profile' : ''}`}>{ANALYSIS_CATALOG.find(preset => preset.id === settings.presetId)?.name ?? 'Custom'}{settings.timeBalancing === 'raw' ? '' : ` · ${settings.timeBalancing === 'monthly-median' ? 'monthly' : 'quarterly'} medians`}{columnSettings[p.key] ? ' · this parameter only' : ''}</span>
        </ColumnActions>
      </th>
    })}</tr></thead>{tableGroups.map(section => {
      const collapsed = groupBy !== '' && collapsedGroups.includes(section.key)
      const total = groupedRows.find(full => full.key === section.key)?.rows.length ?? section.rows.length
      return <tbody key={section.key} aria-label={groupBy ? `${groupBy}: ${section.label}` : undefined}>
        {groupBy && <tr className="pv-group-row"><th scope="rowgroup" colSpan={parameters.length + shownAttributes.length + 2}>
          <button type="button" aria-expanded={!collapsed} aria-label={`${collapsed ? 'Expand' : 'Collapse'} group ${section.label}`} onClick={() => setCollapsedGroups(previous => collapsed ? previous.filter(key => key !== section.key) : [...previous, section.key])}>
            <Icon name="chevron" /><span className="pv-group-name">{section.label}</span><span className="pv-group-count">{collapsed || section.rows.length === total ? `${total} ${total === 1 ? 'patient' : 'patients'}` : `${section.rows.length} of ${total} patients on this page`}</span>
          </button>
        </th></tr>}
        {!collapsed && section.rows.map(row => <tr key={String(row.patientId)}><td><input type="checkbox" aria-label={`Select patient ${row.patientId}`} checked={selectedSet.has(row.patientId)} onChange={event => setSelected(previous => event.target.checked ? [...previous, row.patientId] : previous.filter(id => id !== row.patientId))} /></td><th scope="row"><button ref={element => { if (element) personButtons.current.set(row.patientId, element); else personButtons.current.delete(row.patientId) }} aria-label={`Open patient ${row.patientId}`} title={String(row.patientId)} onClick={() => open(row.patientId)}>{row.patientId}</button></th>{shownAttributes.map(attribute => {
          const value = attributeLabel(attribute, data.patientAttributes[String(row.patientId)]?.[attribute])
          return <td key={`attribute:${attribute}`} className="pv-attribute-column"><span title={value} aria-label={value === undefined ? 'Not recorded' : undefined}>{value ?? '—'}</span></td>
        })}{row.cells.map((cell, i) => <td key={keys[i]}><div className={`pv-graph pv-graph-${chartSize}`} data-zoom={chartSize}><WorkspaceSparkline width={chartWidth} height={SPARK_SIZES[chartSize].height} scaleMode={scaleMode} cell={cell} measurements={measurementsFor(row.patientId, cell)} patientId={row.patientId} label={parameters[i].label} domain={scaleMode === 'shared' ? sparkDomains[i] : zoomDomains[i]} fit={fitKeys.includes(keys[i]) && parameterKeySet.has(keys[i])} logScale={logColumn[i]} events={display.events ? eventsByPatient.get(patientIdKey(row.patientId)) : undefined} /></div><CellSummary cell={cell} patientId={row.patientId} fit={trendKeys.includes(keys[i]) && fitConfigs[keys[i]].fitModel !== 'none'} compact={cellDetails === 'compact'} minimal={cellDetails === 'minimal'} warningIcons={warningIcons} slopeDecimals={slopeDecimals[i]} missing={missingNote(keys[i], row.patientId)} formulaSwitches={switchesFor(keys[i], row.patientId)} columnSettings={(columnSettings[keys[i]] ?? fitSettings).moduleSettings} events={eventsByPatient.get(patientIdKey(row.patientId))} timeBalancing={(columnSettings[keys[i]] ?? fitSettings).timeBalancing} hiddenEndpointBadges={hiddenBadgeSet} latestOperator={measurementsFor(row.patientId, cell).filter(m => m.labDatum && m.wertNum !== null).at(-1)?.wertOperator} /></td>)}</tr>)}
      </tbody>
    })}</table></div>}
    {mode === 'table' && visible.length > 0 && pageCount > 1 && <nav className="wt-table-pages wt-table-pages-below" aria-label="Patient table pages, below the table"><button type="button" aria-label="Below the table: previous page" disabled={activeTablePage === 0} onClick={() => changePage(activeTablePage - 1, 'bottom')}>Previous</button><span>Page {activeTablePage + 1} of {pageCount} · patients {firstShown}–{lastShown} of {pagedRows.length}</span><button type="button" aria-label="Below the table: next page" disabled={activeTablePage >= pageCount - 1} onClick={() => changePage(activeTablePage + 1, 'bottom')}>Next</button></nav>}
    {mode === 'overlay' && <div className="wt-plot-grid">{parameters.map((parameter, index) => <div key={`${parameter.key}-${groupBy}`}><div className="pv-plot-controls">{parameterControls(parameter)}</div><WorkspacePlot data={data} parameter={parameter} parameterIndex={index} sharedDomain={sparkDomains[index]} scaleMode={scaleMode} cohortRows={visible} axis={axis} groupBy={groupBy} highlight={highlight} display={display} pointsAuto={pointsAuto} onPointsAutoHidden={reportPointsAutoHidden} slopeDecimals={slopeDecimals[index]} logScale={logColumn[index]} showFit={fitKeys.includes(parameter.key) && parameterKeySet.has(parameter.key)} onOpen={open} /></div>)}</div>}
    {mode === 'detail' && current && <section><div className="wt-toolbar"><button type="button" className="wt-back-button" aria-label={`Back to ${returnMode}`} onClick={() => {
      if (returnMode === 'table') tablePosition.current.restore = true
      setMode(returnMode)
      if (typeof window !== 'undefined' && window.history?.pushState) window.history.pushState({ page: 'Trajectories', mode: returnMode }, '')
    }}>← Back to {returnMode}</button><h2 ref={detailHeading} tabIndex={-1}>Patient {current.patientId}</h2><button disabled={currentIndex <= 0} onClick={() => {
      const nextId = visible[currentIndex - 1].patientId
      setPatientId(nextId)
      if (typeof window !== 'undefined' && window.history?.replaceState) window.history.replaceState({ page: 'Trajectories', mode: 'detail', patientId: nextId, returnMode }, '')
    }}>Previous patient</button><label>Open patient directly<select value={currentIndex} onChange={event => {
      const nextId = visible[Number(event.target.value)].patientId
      setPatientId(nextId)
      if (typeof window !== 'undefined' && window.history?.replaceState) window.history.replaceState({ page: 'Trajectories', mode: 'detail', patientId: nextId, returnMode }, '')
    }}>{keptOutsideMarks && <option value={-1}>{keptOutsideMarks.patientId} (not in “Show only”)</option>}{visible.map((row, index) => <option key={String(row.patientId)} value={index}>{row.patientId}</option>)}</select></label><button disabled={currentIndex >= visible.length - 1} onClick={() => {
      const nextId = visible[currentIndex + 1].patientId
      setPatientId(nextId)
      if (typeof window !== 'undefined' && window.history?.replaceState) window.history.replaceState({ page: 'Trajectories', mode: 'detail', patientId: nextId, returnMode }, '')
    }}>Next patient</button><span>{keptOutsideMarks ? '–' : currentIndex + 1} / {visible.length}</span></div>{keptOutsideMarks && <p className="card pv-outside-marks" role="status">Patient {keptOutsideMarks.patientId} does not match “Show only: {markFilters.map(rowMarkLabel).join(' + ')}” and stays open. {visible.length === 0 ? 'No patient matches at present.' : `“Next patient” continues with the ${visible.length === 1 ? 'one matching patient' : `${visible.length} matching patients`}.`} <button type="button" onClick={() => { setMarkFilters([]); setTablePage(0) }}>Show all patients</button></p>}<div className="wt-plot-grid">{parameters.map((parameter, index) => {
      const measurements = measurementsFor(current.patientId, parameter)
      const fitStatus = measurementFitStatus(measurements, current.cells[index])
      return <div key={parameter.key}><div className="pv-plot-controls">{parameterControls(parameter)}</div><WorkspacePlot data={data} parameter={parameter} parameterIndex={index} sharedDomain={sparkDomains[index]} scaleMode={scaleMode} cohortRows={[current]} axis={axis} groupBy="" highlight={null} display={display} slopeDecimals={slopeDecimals[index]} logScale={logColumn[index]} showFit={fitKeys.includes(parameter.key) && parameterKeySet.has(parameter.key)} onOpen={open} /><div className="card"><CellSummary detailed slopeDecimals={slopeDecimals[index]} missing={missingNote(parameter.key, current.patientId)} formulaSwitches={switchesFor(parameter.key, current.patientId)} cell={current.cells[index]} patientId={current.patientId} fit={trendKeys.includes(parameter.key) && fitConfigs[parameter.key].fitModel !== 'none'} columnSettings={(columnSettings[parameter.key] ?? fitSettings).moduleSettings} events={eventsByPatient.get(patientIdKey(current.patientId))} excludesAki={(columnSettings[parameter.key] ?? fitSettings).exclusions.excludeAkiWindows} timeBalancing={(columnSettings[parameter.key] ?? fitSettings).timeBalancing} /><details open={!current.cells[index].points.length || axis === 'age' && data.patients.find(p => p.id === current.patientId)?.baselineAge === null}><summary>Show measurements ({measurements.length})</summary><PatientMeasurementTable parameter={parameter} measurements={measurements} fitStatus={fitStatus} events={eventsByPatient.get(patientIdKey(current.patientId)) ?? NO_EVENTS} />{!measurements.length && <p>No measurements available for this parameter.</p>}</details></div></div>
    })}</div><SeriesComparison rows={data.rows} patientId={current.patientId} /><section className="card"><h3>Events for this patient</h3>{data.events.some(e => e.patientId === current.patientId) ? <ul>{eventsByDate(data.events.filter(e => e.patientId === current.patientId)).map((event, i) => <li key={i}>{formatWorkspaceDate(event.date)}: {eventText(event)}</li>)}</ul> : <p>No events recorded.</p>}</section><section className="card"><h3>AKI episodes for this patient</h3>{akiEpisodes.some(episode => episode.patientId === current.patientId)
      ? <ul>{akiEpisodes.filter(episode => episode.patientId === current.patientId).map((episode, i) => <li key={i}>Stage {akiStageLabel(episode.stage)}, onset {formatWorkspaceDate(episode.onset)}, creatinine peak {formatWorkspaceNumber(episode.peakValue)} mg/dl on {formatWorkspaceDate(episode.peakDate)}; baseline {akiEpisodeBaselineLabel(episode)} mg/dl ({akiCriterionLabel(episode.criterion)}; {episode.parameter} [{episode.unit ?? 'no unit'}]); end {akiEpisodeEndLabel(episode)}; dialysis start {akiEpisodeDialysisLabel(episode)}</li>)}</ul>
      : <p>No AKI episode detected. Detection needs serum creatinine values close enough in time: a rise within 48 hours or 7 days.</p>}<p className="wt-muted">Automated KDIGO creatinine screening, not a diagnosis. Display → “AKI windows and episodes” marks them in the charts.</p></section></section>}
    {active && draftKeys !== null && <dialog ref={dialog} open={typeof HTMLDialogElement.prototype.showModal !== 'function' ? true : undefined} onCancel={event => { event.preventDefault(); closePicker() }} aria-labelledby="wt-parameter-title" className="wt-parameter-dialog"><h2 id="wt-parameter-title">Select parameters</h2><label>Search parameters<input autoFocus value={parameterQuery} onChange={event => setParameterQuery(event.target.value)} /></label><div className="wt-toolbar"><button onClick={() => setDraftKeys(data.parameters.map(p => p.key))}>All parameters</button><button onClick={() => setDraftKeys([])}>No parameters</button></div><div className="wt-parameter-options" role="group" aria-label="Parameter options">{data.parameters.filter(p => p.label.toLocaleLowerCase().includes(parameterQuery.toLocaleLowerCase())).map(p => <label key={p.key}><input type="checkbox" checked={draftKeys.includes(p.key)} onChange={event => setDraftKeys(previous => event.target.checked ? [...previous!, p.key] : previous!.filter(key => key !== p.key))} /><span>{p.label}</span></label>)}</div><div className="wt-toolbar"><button onClick={() => { setParameterKeys(draftKeys); closePicker() }}>Apply</button><button onClick={closePicker}>Cancel</button></div></dialog>}
    {active && recordOpen && <AnalysisRecordDialog data={data} parameters={parameters} trendKeys={trendKeys} logKeys={logKeys} groupBy={groupBy} onClose={closeRecord} onChange={changeFromRecord}
      onApplyView={(nextKeys, nextTrend, nextLog) => { if (nextKeys) setParameterKeys(nextKeys); setTrend(nextTrend); setLogKeys(nextLog) }} />}
    <AnalysisDrawer open={active && openTool === 'analysis'} onClose={closeTool} title={settingsScope ? parameters.find(parameter => parameter.key === settingsScope)?.label ?? 'Parameter analysis' : 'General defaults'}>
            <QuietAnalysisSettings parameters={parameters} sharedSettings={fitSettings} overrides={columnSettings}
        scope={settingsScope} onChange={changeSettings} onReset={resetColumnSettings} events={data.events}
 />
    </AnalysisDrawer>
  </div>
}
