/** Presentation only: stored sex codes and grouping identities remain unchanged. */
export function sexLabel(value?: string | null): string {
  if (!value) return 'Not recorded'
  return ({ w: 'Female', m: 'Male', d: 'Diverse' } as Record<string, string>)[value] ?? value
}
