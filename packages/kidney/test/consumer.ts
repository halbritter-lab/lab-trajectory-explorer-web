// Type-checked against the built declarations (`pnpm test:kidney`), resolved
// through the package name the way a Node consumer resolves it. Mirrors the
// README's example so that example keeps compiling.
import {
  appendComputedEgfr,
  ckdEpi2021,
  ckdProgressionConfig,
  computedEgfrName,
  COMPUTED_EGFR_UNIT,
  creatinineSourceOptions,
  defaultCreatinineSource,
  fitGlobal,
  loadDatasetFromWorkbook,
  type FitConfig,
  type LabRow,
} from '@halbritter-lab/kidney-trajectories'

// @ts-expect-error a wrong argument type must be rejected, proving the types resolved rather than falling back to any
ckdEpi2021('1.2')

const { rows } = loadDatasetFromWorkbook(new Uint8Array())
const source = defaultCreatinineSource(creatinineSourceOptions(rows))
const withEgfr: LabRow[] = appendComputedEgfr(rows, { formula: 'ckd-epi-2021', source })
const parameter = { bezeichnung: computedEgfrName('ckd-epi-2021'), einheit: COMPUTED_EGFR_UNIT }
const config: FitConfig = ckdProgressionConfig(parameter)
const fit = fitGlobal(withEgfr.flatMap((r) => r.bezeichnung === parameter.bezeichnung && r.labDatum && r.wertNum !== null ? [{ date: r.labDatum, value: r.wertNum }] : []))

export { config, fit }
