/**
 * The Content-Security-Policy of the built page, added to dist/index.html as a
 * meta element by vite.config.ts. Not part of the development server's page:
 * its hot-reload client needs an inline script.
 *
 * What it restricts: the document itself, that is the main thread. It may
 * load scripts, styles and data only from the app's own address; images also
 * from `data:` (favicon) and `blob:` (PNG export draws the chart from a blob).
 * Inline styles stay allowed for the static notice in index.html.
 *
 * What it does not restrict: the model worker. A worker takes its policy from
 * the response headers of its own script, and a static host such as GitHub
 * Pages sends none. Since 2026-11-22 the worker loads the R runtime and the
 * R packages from the app's own address too (K43), so the policy names no
 * other host; 'wasm-unsafe-eval' stays listed so the fit keeps working in a
 * browser that applies the document's policy to its workers. The policy is
 * therefore evidence for the main thread, not a guarantee for the whole app;
 * only a header on the worker script would cover the worker. A meta policy
 * also does not restrict navigation through links.
 */
export const CONTENT_SECURITY_POLICY_DIRECTIVES: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'wasm-unsafe-eval'"],
  'worker-src': ["'self'"],
  'connect-src': ["'self'"],
  'img-src': ["'self'", 'data:', 'blob:'],
  'style-src': ["'self'", "'unsafe-inline'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'none'"],
}

export function contentSecurityPolicy(): string {
  return Object.entries(CONTENT_SECURITY_POLICY_DIRECTIVES).map(([name, sources]) => `${name} ${sources.join(' ')}`).join('; ')
}
