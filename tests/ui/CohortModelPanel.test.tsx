import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CohortModelPanel } from '../../src/ui/cohort/CohortModelPanel'
import {
  DEFAULT_MIXED_MODEL_CONFIG,
  mixedModelConfigLabel,
  mixedModelFormula,
} from '../../src/core/mixedModel/config'
import { useAppStore } from '../../src/ui/state/store'
import type { CohortSeriesSpec } from '../../src/core/cohort/screening'

const spec = { bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', mode: 'global' } as CohortSeriesSpec

function renderPanel(overrides: Record<string, unknown> = {}) {
  useAppStore.getState().reset()
  const onConfigChange = vi.fn()
  render(
    <CohortModelPanel
      rows={[]}
      patientIds={[]}
      groups={[]}
      groupColors={new Map()}
      spec={spec}
      seriesIndex={0}
      seriesKey="eGFR|ml/min/1.73m2"
      seriesUnit="ml/min/1.73m2"
      fitConfigHash="fit"
      config={DEFAULT_MIXED_MODEL_CONFIG}
      formula={mixedModelFormula(DEFAULT_MIXED_MODEL_CONFIG)}
      formulaLabel={mixedModelConfigLabel(DEFAULT_MIXED_MODEL_CONFIG)}
      dataPolicySummary="Uses the active eGFR cohort."
      validateConfig={() => null}
      onConfigChange={onConfigChange}
      {...overrides}
    />,
  )
  return { onConfigChange }
}

describe('CohortModelPanel', () => {
  it('renders model settings and the results table with a Whole cohort row', () => {
    renderPanel()
    expect(screen.getByRole('region', { name: 'Model settings' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Cohort mixed model' })).toBeInTheDocument()
    expect(screen.getByText('Whole cohort')).toBeInTheDocument()
  })

  it('applies edited settings via onConfigChange', async () => {
    const { onConfigChange } = renderPanel()
    // Default config matches the R-script model; checking baseline age adds it.
    await userEvent.click(screen.getByLabelText('Baseline age'))
    await userEvent.click(screen.getByRole('button', { name: 'Apply settings' }))

    expect(onConfigChange).toHaveBeenCalledTimes(1)
    expect(onConfigChange.mock.calls[0][0].covariates).toEqual(['baseline_age'])
  })

  it('does not offer applying unchanged settings', async () => {
    const { onConfigChange } = renderPanel()
    const apply = screen.getByRole('button', { name: 'Apply settings' })

    expect(apply).toBeDisabled()
    await userEvent.click(apply)

    expect(onConfigChange).not.toHaveBeenCalled()
  })
})
