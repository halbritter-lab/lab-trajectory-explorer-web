export interface ProjectionTarget {
  id: string
  label: string
  outcome: string
  unit: string
  threshold: number
  direction: 'below' | 'above'
}

export interface LinearProjectionInput {
  intercept: number
  slopePerYear: number
  outcome: string
  unit: string
  referenceTimeYears: number
  horizonYears: number
  target: ProjectionTarget
}

export type ProjectionStatus = 'crossing' | 'already_met' | 'flat' | 'away' | 'beyond_horizon' | 'invalid' | 'incompatible_target'
export interface LinearProjectionResult {
  status: ProjectionStatus
  modelTimeYears: number | null
  remainingYears: number | null
}

/** Boundary intersections of a fitted line; not a clinical event-time model. */
export function projectLinearThreshold(input: LinearProjectionInput): LinearProjectionResult {
  const {intercept:a, slopePerYear:b, referenceTimeYears:r, horizonYears:h, target} = input
  const failed = (status: ProjectionStatus): LinearProjectionResult => ({status, modelTimeYears:null, remainingYears:null})
  if (![a,b,r,h,target.threshold].every(Number.isFinite) || r < 0 || h <= 0 || !['below','above'].includes(target.direction)) return failed('invalid')
  if (input.outcome !== target.outcome || input.unit !== target.unit) return failed('incompatible_target')
  const referenceValue = a + b*r
  if (!Number.isFinite(referenceValue)) return failed('invalid')
  if (target.direction === 'below' ? referenceValue < target.threshold : referenceValue > target.threshold) return failed('already_met')
  if (b === 0) return failed('flat')
  if (target.direction === 'below' ? b > 0 : b < 0) return failed('away')
  if (referenceValue === target.threshold) return {status:'crossing',modelTimeYears:r,remainingYears:0}
  const modelTimeYears = (target.threshold-a)/b
  const remainingYears = modelTimeYears-r
  if (!Number.isFinite(modelTimeYears) || !Number.isFinite(remainingYears) || remainingYears < 0) return failed('invalid')
  if (remainingYears > h) return failed('beyond_horizon')
  return {status:'crossing',modelTimeYears:modelTimeYears === 0 ? 0 : modelTimeYears,remainingYears:remainingYears === 0 ? 0 : remainingYears}
}
