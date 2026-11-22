import { describe, expect, it } from 'vitest'
import { CONTENT_SECURITY_POLICY_DIRECTIVES, contentSecurityPolicy } from '../../src/build/contentSecurityPolicy'

// Whether the policy breaks a real fit or an export cannot be seen here: that
// is checked in a browser (tests/e2e/start-and-offline.e2e.ts and the smoke
// checklist, which asks for a real webR fit).
describe('Content-Security-Policy of the build', () => {
  it('allows the app\'s own address and no other host, since R is served with the app', () => {
    expect(contentSecurityPolicy()).toBe(
      "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; "
      + "connect-src 'self'; img-src 'self' data: blob:; "
      + "style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; form-action 'none'")
    const external = Object.values(CONTENT_SECURITY_POLICY_DIRECTIVES).flat().filter(source => source.includes('//'))
    expect(external).toEqual([])
  })
  it('allows no inline or evaluated script', () => {
    expect(CONTENT_SECURITY_POLICY_DIRECTIVES['script-src']).not.toContain("'unsafe-inline'")
    expect(CONTENT_SECURITY_POLICY_DIRECTIVES['script-src']).not.toContain("'unsafe-eval'")
  })
})
