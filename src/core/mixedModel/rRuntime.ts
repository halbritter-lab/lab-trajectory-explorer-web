import pins from './rRuntimePins.json'

/**
 * The R runtime and R packages a cohort model fit uses. Every build serves
 * them from the app's own address (K43): scripts/vendor_r_runtime.mjs puts
 * webR from the npm package `webr` into `webr/` and the pinned binary
 * packages with a PACKAGES index into `r-packages/`, next to index.html.
 * The worker passes these locations to webR, so a fit makes no request to
 * another host. Versions and checksums are pinned in rRuntimePins.json.
 */
export const R_RUNTIME_PINS = pins
export const WEBR_VERSION = pins.webr.version
export const R_VERSION = pins.webr.rVersion
export const PINNED_R_PACKAGES: readonly string[] = pins.packages.map(pkg => pkg.name)

/** Paths relative to the address the app is served from. */
export const WEBR_RUNTIME_PATH = 'webr/'
export const R_PACKAGE_REPOSITORY_PATH = 'r-packages'
export const R_PACKAGE_CONTRIB_PATH = `${R_PACKAGE_REPOSITORY_PATH}/bin/emscripten/contrib/${R_VERSION.split('.').slice(0, 2).join('.')}`

/** Size of the R files the first fit on the demo data loads (22 files,
 * 38.7 MB; the app itself adds 1.3 MB), measured 2026-11-22 on a production
 * build served without compression (webR 0.6.0 with R 4.6.0 and the 13
 * pinned packages). Fixed by the pins; a server that compresses sends less. */
export const R_FIRST_FIT_DOWNLOAD_MB = 39
/** English, for the Methods page; the interface formats the size with `t()`. */
export const R_FIRST_FIT_DOWNLOAD = `about ${R_FIRST_FIT_DOWNLOAD_MB} MB`

/**
 * The address the app is served from, seen from the model worker. In a build
 * Vite writes the worker into `assets/`, one level below index.html; the
 * development server serves the worker from its source path and the public
 * files at its root.
 */
export function rAssetRoot(workerUrl: string, dev: boolean): URL {
  return new URL(dev ? '/' : '../', workerUrl)
}
