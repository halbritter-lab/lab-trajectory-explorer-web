import { useMemo } from 'react'
import { useAppStore } from '../state/store'
import { cohortSeriesOptions, seriesDisplayLabel } from '../options'

export function SeriesStrip() {
  const displayRows = useAppStore((s) => s.displayRows())
  const patientId = useAppStore((s) => s.selectedPatientId)
  const configs = useAppStore((s) => s.seriesConfigs)
  const setSeriesConfig = useAppStore((s) => s.setSeriesConfig)
  const addSeries = useAppStore((s) => s.addSeries)
  const removeSeries = useAppStore((s) => s.removeSeries)

  const opts = useMemo(
    () => (patientId !== null ? cohortSeriesOptions(displayRows) : []),
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
          {configs.length > 1 && <button onClick={() => removeSeries(i)} aria-label={`Remove series ${i + 1}`}>×</button>}
        </div>
        )
      })}
      {configs.length < 3 && <button onClick={addSeries}>+ Add series</button>}
    </div>
  )
}
