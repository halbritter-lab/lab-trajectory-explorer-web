import { useMemo } from 'react'
import { useAppStore } from '../state/store'
import { seriesOptions, seriesDisplayLabel } from '../options'
import type { SlopeMode } from '../../core/stats/summarize'

const MODE_LABELS: Record<SlopeMode, string> = {
  global: 'Global (single fit)',
  'gap-split': 'Gap-split (segment at gaps)',
  rolling: 'Rolling (sliding window)',
  'global-robust': 'Robust (Theil-Sen)',
  'chronic-ckd': 'Chronic CKD (exclude early dip)',
  'aki-aware': 'AKI-aware (exclude episodes)',
  'event-driven': 'Event-driven (split at events)',
}
const MODES = Object.keys(MODE_LABELS) as SlopeMode[]

export function SeriesStrip() {
  const displayRows = useAppStore((s) => s.displayRows())
  const patientId = useAppStore((s) => s.selectedPatientId)
  const configs = useAppStore((s) => s.seriesConfigs)
  const setSeriesConfig = useAppStore((s) => s.setSeriesConfig)
  const addSeries = useAppStore((s) => s.addSeries)
  const removeSeries = useAppStore((s) => s.removeSeries)

  const opts = useMemo(
    () => (patientId !== null ? seriesOptions(displayRows, patientId) : []),
    [displayRows, patientId],
  )

  return (
    <div className="series-strip">
      {configs.map((cfg, i) => {
        const selectValue = cfg.bezeichnung ? `${cfg.bezeichnung}|${cfg.einheit ?? ''}` : ''
        // Keep the dropdown in sync with the stored config: if the selected
        // parameter isn't among this patient's options (e.g. after switching to
        // a patient who lacks it), surface it as an explicit "not available"
        // option instead of silently falling back to the empty placeholder.
        const selectedMissing = selectValue !== '' && !opts.some((o) => `${o.bezeichnung}|${o.einheit ?? ''}` === selectValue)
        return (
        <div className="series-card" key={i}>
          <select
            aria-label={`Series ${i + 1} parameter`}
            value={selectValue}
            onChange={(e) => {
              const [bez, einheit] = e.target.value.split('|')
              setSeriesConfig(i, { bezeichnung: bez || null, einheit: einheit || null })
            }}
          >
            <option value="">— pick parameter —</option>
            {selectedMissing && (
              <option value={selectValue}>{seriesDisplayLabel({ bezeichnung: cfg.bezeichnung as string, einheit: cfg.einheit ?? null })} — not in this patient</option>
            )}
            {opts.map((o) => (
              <option key={`${o.bezeichnung}|${o.einheit ?? ''}`} value={`${o.bezeichnung}|${o.einheit ?? ''}`}>
                {seriesDisplayLabel(o)}
              </option>
            ))}
          </select>
          <select aria-label={`Series ${i + 1} mode`} value={cfg.mode} onChange={(e) => setSeriesConfig(i, { mode: e.target.value as SlopeMode })}>
            {MODES.map((m) => <option key={m} value={m}>{MODE_LABELS[m]}</option>)}
          </select>
          {cfg.mode === 'gap-split' && (
            <label className="excl-days" title="Gaps larger than this many days start a new segment">
              gap days
              <input
                type="number"
                min={1}
                aria-label={`Series ${i + 1} gap days`}
                value={cfg.gapDays}
                onChange={(e) => setSeriesConfig(i, { gapDays: Math.max(1, Number(e.target.value) || 1) })}
              />
            </label>
          )}
          {cfg.mode === 'rolling' && (
            <>
              <label className="excl-days" title="Width of each rolling fit window">
                window days
                <input
                  type="number"
                  min={1}
                  aria-label={`Series ${i + 1} window days`}
                  value={cfg.windowDays}
                  onChange={(e) => setSeriesConfig(i, { windowDays: Math.max(1, Number(e.target.value) || 1) })}
                />
              </label>
              <label className="excl-days" title="Spacing between rolling fit windows">
                step days
                <input
                  type="number"
                  min={1}
                  aria-label={`Series ${i + 1} step days`}
                  value={cfg.stepDays}
                  onChange={(e) => setSeriesConfig(i, { stepDays: Math.max(1, Number(e.target.value) || 1) })}
                />
              </label>
            </>
          )}
          {cfg.mode === 'chronic-ckd' && (
            <label className="excl-days" title="Days after series start to exclude from the chronic slope fit">
              cutoff days
              <input
                type="number"
                min={0}
                aria-label={`Series ${i + 1} cutoff days`}
                value={cfg.cutoffDays}
                onChange={(e) => setSeriesConfig(i, { cutoffDays: Math.max(0, Number(e.target.value) || 0) })}
              />
            </label>
          )}
          {cfg.mode === 'aki-aware' && (
            <label className="excl-days" title="Days after each AKI episode to exclude from the trend fit">
              excl. days
              <input
                type="number"
                min={0}
                aria-label={`Series ${i + 1} exclusion days`}
                value={cfg.exclusionDays}
                onChange={(e) => setSeriesConfig(i, { exclusionDays: Math.max(0, Number(e.target.value) || 0) })}
              />
            </label>
          )}
          {configs.length > 1 && <button onClick={() => removeSeries(i)} aria-label={`Remove series ${i + 1}`}>×</button>}
        </div>
        )
      })}
      {configs.length < 3 && <button onClick={addSeries}>+ Add series</button>}
    </div>
  )
}
