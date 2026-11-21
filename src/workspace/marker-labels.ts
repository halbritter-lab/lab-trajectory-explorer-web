/** One marker label before layout: the marker's pixel position and its text. */
export interface MarkerLabel { x: number; y: number; label: string; color?: string }
export interface PlacedMarkerLabel { x: number; y: number; text: string; color?: string; anchor: 'start' | 'middle' | 'end' }

/** Places marker labels so that they neither sit on top of each other nor
 * leave the plot area:
 * - neighbours with the same text and colour share one label when each is
 *   closer than `minGap` pixels to the one before and the run is narrower than
 *   two `minGap`; it is centred over the run at its highest marker and
 *   suffixed with the count ("AKI III ×3");
 * - a label moves up by whole lines (`lineHeight`), but not above `top`,
 *   while it would overlap an earlier label (closer than `minGap`
 *   horizontally and `lineHeight` vertically) or cover one of the
 *   `obstacles`, the measurement points of the labelled trajectory;
 * - within `edge` pixels of the left or right border the text is anchored at
 *   the marker and runs inwards.
 * Input order does not matter; the result is ordered left to right. */
export function layoutMarkerLabels(
  labels: readonly MarkerLabel[], bounds: { left: number; right: number; top: number },
  obstacles: readonly { x: number; y: number }[] = [], minGap = 46, lineHeight = 11, edge = 24,
): PlacedMarkerLabel[] {
  const sorted = [...labels].sort((a, b) => a.x - b.x)
  const runs: MarkerLabel[][] = []
  for (const item of sorted) {
    const run = runs[runs.length - 1]
    if (run && run[0].label === item.label && run[0].color === item.color && item.x - run[run.length - 1].x < minGap && item.x - run[0].x < 2 * minGap) run.push(item)
    else runs.push([item])
  }
  const placed: PlacedMarkerLabel[] = []
  for (const run of runs) {
    const x = (run[0].x + run[run.length - 1].x) / 2
    const text = run.length > 1 ? `${run[0].label} ×${run.length}` : run[0].label
    const anchor = x < bounds.left + edge ? 'start' : x > bounds.right - edge ? 'end' : 'middle'
    // The text box around the baseline `y`, for a 10-pixel font.
    const width = text.length * 5.5
    const from = anchor === 'middle' ? x - width / 2 : anchor === 'start' ? x - 5 : x + 5 - width
    const blocked = (y: number) => placed.some(other => Math.abs(other.x - x) < minGap && Math.abs(other.y - y) < lineHeight)
      || obstacles.some(point => point.x > from - 4 && point.x < from + width + 4 && point.y > y - lineHeight && point.y < y + 4)
    let y = Math.min(...run.map(item => item.y))
    while (blocked(y) && y - lineHeight >= bounds.top) y -= lineHeight
    placed.push({ x, y: Math.max(bounds.top, y), text, color: run[0].color, anchor })
  }
  return placed
}
