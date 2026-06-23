import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MiniSparkline } from '../../../src/ui/charts/MiniSparkline'

const d = (s: string) => new Date(s)
const pts = [
  { date: d('2020-01-01'), value: 1.0 },
  { date: d('2020-06-01'), value: 1.2 },
  { date: d('2021-01-01'), value: 1.4 },
]

describe('MiniSparkline', () => {
  it('sizes by zoom level and exposes data-zoom', () => {
    const { container, rerender } = render(<MiniSparkline points={pts} zoom="s" />)
    const svg = () => container.querySelector('svg')!
    expect(svg().getAttribute('data-zoom')).toBe('s')
    expect(svg().getAttribute('width')).toBe('90')
    rerender(<MiniSparkline points={pts} zoom="l" />)
    expect(svg().getAttribute('width')).toBe('280')
  })
  it('draws the AKI band only over its window and keeps the line blue', () => {
    const { container } = render(
      <MiniSparkline points={pts} zoom="s" akiBands={[{ start: d('2020-05-01'), end: d('2020-07-01') }]} />,
    )
    const band = container.querySelector('[data-testid="aki-band"]')!
    expect(band).not.toBeNull()
    expect(container.querySelector('path')!.getAttribute('stroke')).toBe('#2563eb')
    const x = Number(band.getAttribute('x'))
    const w = Number(band.getAttribute('width'))
    expect(x).toBeGreaterThan(0)
    expect(x + w).toBeLessThan(90)
  })
  it('clamps bands to the data range', () => {
    const { container } = render(
      <MiniSparkline points={pts} zoom="s" akiBands={[{ start: d('2020-12-01'), end: d('2021-06-01') }]} />,
    )
    const band = container.querySelector('[data-testid="aki-band"]')!
    expect(Number(band.getAttribute('x')) + Number(band.getAttribute('width'))).toBeLessThanOrEqual(90)
  })
  it('marks excluded points as open circles at m zoom, none at s zoom', () => {
    const m = render(<MiniSparkline points={pts} zoom="m" excludedIdx={[1]} />)
    expect(m.container.querySelectorAll('[data-testid="pt-excluded"]')).toHaveLength(1)
    expect(m.container.querySelectorAll('[data-testid="pt"]')).toHaveLength(2)
    const s = render(<MiniSparkline points={pts} zoom="s" excludedIdx={[1]} />)
    expect(s.container.querySelectorAll('circle')).toHaveLength(0)
  })
  it('renders dashed fit lines', () => {
    const { container } = render(
      <MiniSparkline points={pts} zoom="m" fitLines={[[{ date: d('2020-01-01'), value: 1.0 }, { date: d('2021-01-01'), value: 1.4 }]]} />,
    )
    const line = container.querySelector('[data-testid="fit-line"]')!
    expect(line).not.toBeNull()
    expect(line.getAttribute('stroke-dasharray')).toBe('3 2')
  })
  it('omits the connecting line but keeps points when connect=false', () => {
    const { container } = render(<MiniSparkline points={pts} zoom="s" connect={false} />)
    expect(container.querySelector('path')).toBeNull()
    // points stay visible even at zoom "s" (where the line would normally be the only mark)
    expect(container.querySelectorAll('[data-testid="pt"]').length).toBe(3)
    expect(Number(container.querySelector('[data-testid="pt"]')!.getAttribute('r'))).toBeGreaterThan(0)
  })
  it('renders axes only at l zoom', () => {
    const l = render(<MiniSparkline points={pts} zoom="l" />)
    expect(l.container.querySelectorAll('[data-testid="axis"]').length).toBe(2)
    const m = render(<MiniSparkline points={pts} zoom="m" />)
    expect(m.container.querySelectorAll('[data-testid="axis"]').length).toBe(0)
  })
})
