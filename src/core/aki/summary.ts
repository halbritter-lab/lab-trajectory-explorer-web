const ROMAN: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III' }

function countedStageParts(stages: number[], long = false): string[] {
  const counts = new Map<number, number>()
  for (const s of stages) counts.set(s, (counts.get(s) ?? 0) + 1)
  return [...counts.keys()].sort((a, b) => a - b).map((stage) => {
    const n = counts.get(stage)!
    const r = ROMAN[stage] ?? String(stage)
    return long ? `${n}× stage ${r}` : (n === 1 ? r : `${n}×${r}`)
  })
}

/** Compact cohort-cell chip for KDIGO stages. Mirrors format_aki_chip. */
export function formatAkiChip(stages: number[]): string {
  if (stages.length === 0) return ''
  return 'AKI ' + countedStageParts(stages).join(', ')
}

/** Explanatory count summary for tooltips and plot legends. */
export function formatAkiEpisodeSummary(stages: number[]): string {
  if (stages.length === 0) return ''
  const episodeLabel = stages.length === 1 ? 'episode' : 'episodes'
  return `${stages.length} AKI ${episodeLabel}: ${countedStageParts(stages, true).join(', ')}`
}
