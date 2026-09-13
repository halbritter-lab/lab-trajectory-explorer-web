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
    await userEvent.selectOptions(screen.getByLabelText('Baseline age effect'), 'level')
    await userEvent.click(screen.getByRole('button', { name: 'Apply settings' }))

    expect(onConfigChange).toHaveBeenCalledTimes(1)
    expect(onConfigChange.mock.calls[0][0].factors).toEqual([{ key: 'baseline_age', kind: 'numeric', effect: 'level' }])
  })

  it('does not offer applying unchanged settings', async () => {
    const { onConfigChange } = renderPanel()
    const apply = screen.getByRole('button', { name: 'Apply settings' })

    expect(apply).toBeDisabled()
    await userEvent.click(apply)

    expect(onConfigChange).not.toHaveBeenCalled()
  })
})

it('requires explicit categorical references and applies the genotype example as a draft', async () => {
  const { onConfigChange } = renderPanel({rows:['p1','p2'].map((patientId) => ({patientId,patientSex:null,patientAgeAtLab:50,labDatum:new Date('2024-01-01'),bezeichnung:'other',einheit:null,wert:'60',wertNum:60,wertOperator:'=',loinc:null})),patientIds:['p1','p2'], patientAttributes:{p1:{genotype:'A',sex:'m'},p2:{genotype:'B',sex:'w'}}})
  expect(screen.getByLabelText('genotype effect')).toHaveValue('excluded')
  await userEvent.click(screen.getByRole('button',{name:'Use genotype example'}))
  expect(screen.getByLabelText('genotype effect')).toHaveValue('level_slope')
  expect(screen.getByLabelText('Baseline age effect')).toHaveValue('level_slope')
  expect(screen.getByLabelText('Sex effect')).toHaveValue('level_slope')
  expect(screen.getByRole('button',{name:'Apply settings'})).toBeDisabled()
  expect(onConfigChange).not.toHaveBeenCalled()
  await userEvent.selectOptions(screen.getByLabelText('genotype reference'), 'A')
  await userEvent.selectOptions(screen.getByLabelText('Sex reference'), 'm')
  expect(screen.getByLabelText('Readable formula')).toHaveTextContent('Time (years):"genotype"')
  expect(screen.getByLabelText('Readable formula')).not.toHaveTextContent('factor_0_')
  await userEvent.click(screen.getByRole('button',{name:'Apply settings'}))
  expect(onConfigChange.mock.calls[0][0].factors).toEqual(expect.arrayContaining([{key:'genotype',kind:'categorical',effect:'level_slope',reference:'A'}]))
  expect(screen.getByLabelText('Model population preview')).toHaveTextContent('0 patients')
})

it('previews complete cases without changing the applied population until settings are applied', async () => {
  const patientIds = ['p1','p2','p3','p4']
  const rows = patientIds.flatMap((patientId) => [0,1].map((year) => ({patientId,patientSex:null,patientAgeAtLab:50,labDatum:new Date(`${2024 + year}-01-01`),bezeichnung:'eGFR',einheit:'ml/min/1.73m2',wert:'60',wertNum:60,wertOperator:'=',loinc:null})))
  renderPanel({rows,patientIds,patientAttributes:{p1:{genotype:'A'},p2:{genotype:'B'},p3:{genotype:'A'}}})
  await userEvent.selectOptions(screen.getByLabelText('genotype effect'),'level')
  await userEvent.selectOptions(screen.getByLabelText('genotype reference'),'A')
  expect(screen.getByLabelText('Model population preview')).toHaveTextContent('3 patients / 4; 6 measurements / 8')
  expect(screen.getByLabelText('Model population preview')).toHaveTextContent('p4: Missing genotype')
  expect(screen.getByTestId('cohort-model-row')).toHaveTextContent('Whole cohort48')
})
