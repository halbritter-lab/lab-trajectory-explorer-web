/**
 * The two external hosts a cohort model fit downloads from. The worker starts
 * webR with its default options (see webr.worker.ts), so these are the
 * defaults built into the `webr` package: the R runtime comes from
 * `https://webr.r-wasm.org/v<version>/`, the R packages from
 * `https://repo.r-wasm.org`. Interface texts and the Content-Security-Policy
 * of the build name them from here; a test compares them with the package.
 */
export const WEBR_RUNTIME_HOST = 'webr.r-wasm.org'
export const WEBR_PACKAGE_HOST = 'repo.r-wasm.org'
/** Transfer size of the first fit on the demo data, measured 2026-11-21 with
 * webR 0.6.0 (R 4.6.0, lme4 2.0.6, Matrix 1.7.6): 32.5 MB in 22 requests. The
 * package repository is not version-pinned (OD-21), so the size can change. */
export const WEBR_FIRST_FIT_DOWNLOAD = 'about 33 MB'
