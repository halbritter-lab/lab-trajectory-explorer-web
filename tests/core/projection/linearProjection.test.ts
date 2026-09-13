import { describe, expect, it } from 'vitest'
import { projectLinearThreshold, type LinearProjectionInput } from '../../../src/core/projection/linearProjection'

const base: LinearProjectionInput = {intercept:60,slopePerYear:-3,outcome:'eGFR',unit:'u',referenceTimeYears:0,horizonYears:20,target:{id:'x',label:'Target',outcome:'eGFR',unit:'u',threshold:30,direction:'below'}}
describe('linear threshold projection', () => {
  it.each([[30,10],[25,35/3],[15,15]])('intersects %s at model year %s', (threshold,time) => {
    expect(projectLinearThreshold({...base,target:{...base.target,threshold}})).toEqual({status:'crossing',modelTimeYears:time,remainingYears:time})
  })
  it('keeps model origin separate from reference', () => expect(projectLinearThreshold({...base,referenceTimeYears:2})).toEqual({status:'crossing',modelTimeYears:10,remainingYears:8}))
  it('supports a rising generic outcome', () => expect(projectLinearThreshold({...base,intercept:80,slopePerYear:5,target:{...base.target,threshold:100,direction:'above'}}).remainingYears).toBe(4))
  it.each([
    [{slopePerYear:0},'flat'],[{slopePerYear:3},'away'],[{intercept:20},'already_met'],
    [{horizonYears:9},'beyond_horizon'],[{horizonYears:0},'invalid'],[{referenceTimeYears:-1},'invalid'],
    [{slopePerYear:NaN},'invalid'],[{unit:'other'},'incompatible_target'],
    [{intercept:1,slopePerYear:-Number.MIN_VALUE,target:{...base.target,threshold:0}},'invalid'],
    [{intercept:1,slopePerYear:-1e-100,target:{...base.target,threshold:0}},'beyond_horizon'],
    [{intercept:Number.MAX_VALUE,slopePerYear:Number.MAX_VALUE,referenceTimeYears:2},'invalid'],
  ] as const)('classifies %j as %s', (patch,status) => expect(projectLinearThreshold({...base,...patch})).toEqual({status,modelTimeYears:null,remainingYears:null}))
  it('includes the exact horizon and toward equality', () => {
    expect(projectLinearThreshold({...base,horizonYears:10}).status).toBe('crossing')
    expect(projectLinearThreshold({...base,intercept:30})).toEqual({status:'crossing',modelTimeYears:0,remainingYears:0})
    expect(projectLinearThreshold({...base,intercept:30,slopePerYear:0}).status).toBe('flat')
    expect(projectLinearThreshold({...base,intercept:30,slopePerYear:1}).status).toBe('away')
  })
  it('reports exact reference equality without inverse arithmetic roundoff', () => {
    expect(projectLinearThreshold({...base,intercept:0.1,slopePerYear:0.2,referenceTimeYears:3,target:{...base.target,threshold:0.7000000000000001,direction:'above'}})).toEqual({status:'crossing',modelTimeYears:3,remainingYears:0})
  })
})
