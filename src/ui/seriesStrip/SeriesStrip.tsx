import { useEffect, useMemo, useState } from 'react'
import type { Key } from 'react-aria-components'
import {
  Button,
  ComboBox,
  Input,
  ListBox,
  ListBoxItem,
  Popover,
} from 'react-aria-components'
import { useAppStore } from '../state/store'
import { cohortSeriesOptions, seriesDisplayLabel } from '../options'

type SeriesOption = {
  bezeichnung: string
  einheit: string | null
}

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
        const options = selectedMissing && cfg.bezeichnung
          ? [{ bezeichnung: cfg.bezeichnung, einheit: cfg.einheit ?? null }, ...opts]
          : opts
        return (
        <div className="series-card" key={i}>
          <SeriesCombobox
            ariaLabel={`Series ${i + 1} parameter`}
            options={options}
            selectedKey={selectValue || null}
            placeholder="Pick parameter"
            onSelectionChange={(key) => {
              const selected = options.find((option) => seriesOptionKey(option) === key)
              setSeriesConfig(i, selected
                ? { bezeichnung: selected.bezeichnung, einheit: selected.einheit }
                : { bezeichnung: null, einheit: null })
            }}
          />
          {configs.length > 1 && <button onClick={() => removeSeries(i)} aria-label={`Remove series ${i + 1}`}>×</button>}
        </div>
        )
      })}
      {configs.length < 3 && <button onClick={addSeries}>+ Add series</button>}
    </div>
  )
}

function SeriesCombobox({
  ariaLabel,
  options,
  selectedKey,
  placeholder,
  onSelectionChange,
}: {
  ariaLabel: string
  options: SeriesOption[]
  selectedKey: string | null
  placeholder: string
  onSelectionChange: (key: string | null) => void
}) {
  const [inputValue, setInputValue] = useState(() => {
    const selected = options.find((option) => seriesOptionKey(option) === selectedKey)
    return selected ? seriesDisplayLabel(selected) : ''
  })
  const selectedOption = useMemo(
    () => options.find((option) => seriesOptionKey(option) === selectedKey) ?? null,
    [options, selectedKey],
  )
  const selectedLabel = selectedOption ? seriesDisplayLabel(selectedOption) : ''
  useEffect(() => {
    setInputValue(selectedLabel)
  }, [selectedLabel])
  const activeQuery = inputValue === selectedLabel ? '' : inputValue
  const filteredOptions = useMemo(
    () => activeQuery.trim()
      ? options.filter((option) => matchesSeriesSearch(option, activeQuery))
      : options,
    [options, activeQuery],
  )

  return (
    <ComboBox<SeriesOption>
      aria-label={ariaLabel}
      className="series-combobox"
      items={filteredOptions}
      selectedKey={selectedKey}
      inputValue={inputValue}
      allowsEmptyCollection
      defaultFilter={() => true}
      onInputChange={setInputValue}
      onSelectionChange={(key: Key | null) => {
        const nextKey = key === null ? null : String(key)
        const selected = options.find((option) => seriesOptionKey(option) === nextKey)
        setInputValue(selected ? seriesDisplayLabel(selected) : '')
        onSelectionChange(nextKey)
      }}
    >
      <div className="series-combobox-field">
        <Input
          className="series-combobox-input"
          placeholder={placeholder}
          onFocus={(event) => event.currentTarget.select()}
          onClick={(event) => event.currentTarget.select()}
          onKeyDown={(event) => {
            if (
              selectedLabel &&
              inputValue === selectedLabel &&
              event.key.length === 1 &&
              !event.altKey &&
              !event.ctrlKey &&
              !event.metaKey
            ) {
              event.preventDefault()
              setInputValue(event.key)
            }
          }}
          onBlur={() => {
            if (selectedOption) setInputValue(seriesDisplayLabel(selectedOption))
          }}
        />
        <Button className="series-combobox-button" aria-label="Show parameters">
          <span className="series-combobox-caret" aria-hidden="true" />
        </Button>
      </div>
      <Popover className="series-combobox-popover" placement="bottom start" offset={4}>
        <ListBox<SeriesOption>
          className="series-combobox-list"
          renderEmptyState={() => <div className="series-combobox-empty">No matching parameters</div>}
        >
          {(option) => (
            <ListBoxItem
              id={seriesOptionKey(option)}
              textValue={seriesDisplayLabel(option)}
              className="series-combobox-option"
            >
              {seriesDisplayLabel(option)}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </ComboBox>
  )
}

function seriesOptionKey(opt: SeriesOption): string {
  return `${opt.bezeichnung}|${opt.einheit ?? ''}`
}

function matchesSeriesSearch(opt: SeriesOption, query: string): boolean {
  const haystack = `${opt.bezeichnung} ${opt.einheit ?? ''}`.toLowerCase()
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((token) => haystack.includes(token))
}
