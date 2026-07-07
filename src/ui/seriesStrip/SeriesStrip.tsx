import { useMemo, useState } from 'react'
import { useAppStore } from '../state/store'
import { cohortSeriesOptions, seriesDisplayLabel } from '../options'

export function SeriesStrip() {
  const displayRows = useAppStore((s) => s.displayRows())
  const patientId = useAppStore((s) => s.selectedPatientId)
  const configs = useAppStore((s) => s.seriesConfigs)
  const setSeriesConfig = useAppStore((s) => s.setSeriesConfig)
  const addSeries = useAppStore((s) => s.addSeries)
  const removeSeries = useAppStore((s) => s.removeSeries)
  const [searchBySeries, setSearchBySeries] = useState<Record<number, string>>({})

  const opts = useMemo(
    () => (patientId !== null ? cohortSeriesOptions(displayRows) : []),
    [displayRows, patientId],
  )

  return (
    <div className="series-strip">
      {configs.map((cfg, i) => {
        const selectValue = cfg.bezeichnung ? `${cfg.bezeichnung}|${cfg.einheit ?? ''}` : ''
        const search = searchBySeries[i] ?? ''
        const filteredOpts = search.trim()
          ? opts.filter((opt) => matchesSeriesSearch(opt, search))
          : opts
        // Keep the dropdown in sync with the stored config: if the selected
        // parameter isn't among this patient's options (e.g. after switching to
        // a patient who lacks it), surface it as an explicit "not available"
        // option instead of silently falling back to the empty placeholder.
        const selectedMissing = selectValue !== '' && !opts.some((o) => `${o.bezeichnung}|${o.einheit ?? ''}` === selectValue)
        const selectedVisible = filteredOpts.some((o) => `${o.bezeichnung}|${o.einheit ?? ''}` === selectValue)
        const visibleOpts = selectedVisible || selectedMissing
          ? filteredOpts
          : [
              ...(cfg.bezeichnung ? [{ bezeichnung: cfg.bezeichnung, einheit: cfg.einheit ?? null }] : []),
              ...filteredOpts,
            ]
        return (
        <div className="series-card" key={i}>
          <input
            type="search"
            className="series-search"
            aria-label={`Search series ${i + 1} parameters`}
            placeholder="Search parameters"
            value={search}
            onChange={(e) => {
              const value = e.currentTarget.value
              setSearchBySeries((current) => ({ ...current, [i]: value }))
            }}
          />
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
            {search.trim() && filteredOpts.length === 0 && (
              <option value="" disabled>No matching parameters</option>
            )}
            {visibleOpts.map((o) => (
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

function matchesSeriesSearch(opt: { bezeichnung: string; einheit: string | null }, query: string): boolean {
  const haystack = `${opt.bezeichnung} ${opt.einheit ?? ''}`.toLowerCase()
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((token) => haystack.includes(token))
}
