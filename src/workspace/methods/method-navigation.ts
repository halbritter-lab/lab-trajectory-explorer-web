export const methodTopics = [
  { id: 'start', label: 'Start here', group: 'Get started', sections: [{ id: 'answers', label: 'Find an answer' }, { id: 'workflow', label: 'Quick guide' }] },
  { id: 'data', label: 'Data & eGFR', group: 'Get started', sections: [{ id: 'egfr', label: 'eGFR prerequisites' }, { id: 'rounding', label: 'Age & rounding' }, { id: 'demographics', label: 'Demographics' }] },
  { id: 'trajectories', label: 'Trajectories', group: 'Get started', sections: [{ id: 'overlay', label: 'Overlay' }, { id: 'events', label: 'Events & display' }, { id: 'screening', label: 'Screening' }] },
  { id: 'fits', label: 'Fits & slopes', group: 'Analysis & interpretation', sections: [{ id: 'choosing', label: 'Model choice' }, { id: 'quality', label: 'Quality flags' }, { id: 'models', label: 'Model assumptions' }, { id: 'pipeline', label: 'Pipeline' }, { id: 'presets', label: 'Presets' }, { id: 'balancing', label: 'Time balancing' }, { id: 'ols', label: 'OLS details' }] },
  { id: 'endpoints', label: 'Endpoints & prediction', group: 'Analysis & interpretation', sections: [{ id: 'missing', label: 'Missing results' }, { id: 'observed', label: 'Observed events' }, { id: 'prediction', label: 'Prediction algorithm' }] },
  { id: 'aki', label: 'AKI & exclusions', group: 'Analysis & interpretation', sections: [{ id: 'detection', label: 'Detection & limitations' }, { id: 'timing', label: 'Timing & windows' }] },
  { id: 'cohort', label: 'Cohort models', group: 'Analysis & interpretation', sections: [{ id: 'preparation', label: 'Inputs & safeguards' }, { id: 'specification', label: 'Model & projections' }] },
  { id: 'export', label: 'Export & reproducibility', group: 'Reference', sections: [{ id: 'workbooks', label: 'Workbook contents' }, { id: 'provenance', label: 'Trace a result' }] },
  { id: 'sources', label: 'Limitations & sources', group: 'Reference', sections: [] },
] as const

export type MethodTopic = typeof methodTopics[number]['id']
export type HelpWorkspace = 'Data' | 'Trajectories' | 'Cohort models'

/** Null for ordinary workspace anchors; invalid help routes fall back to the guide. */
export function getMethodLocation(hash = window.location.hash): { topic: MethodTopic; section: string } | null {
  const match = /^#methods(?:\/([^/]*))?(?:\/([^/]*))?$/.exec(hash)
  if (!match) return hash.startsWith('#methods/') ? { topic: 'start', section: '' } : null
  const topic = methodTopics.find(item => item.id === match[1])
  if (!topic) return { topic: 'start', section: '' }
  const section = topic.sections.find(item => item.id === match[2])?.id ?? ''
  return { topic: topic.id, section }
}
