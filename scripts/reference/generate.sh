#!/usr/bin/env bash
# Regenerates every stored reference case in tests/reference/ (issue #79).
# Research use only. Run from anywhere; works in the repository root.
#
#   pnpm reference:generate                 # all cases, with the installed packages
#   pnpm reference:generate -- --install    # first install the pinned R packages
#   pnpm reference:generate -- --webr       # also refit the mixed models in webR (Chromium)
#   pnpm reference:generate -- ols egfr     # only these parts (mixed, ols, theilsen, survival, egfr, aki)
#
# Needs R (4.6.0, the R version of the browser runtime, is what the stored files
# were generated with) and, for --install, a C/C++/Fortran toolchain (r-base-dev),
# cmake, libnlopt-dev and libudunits2-dev. Packages go to R_REFERENCE_LIB (default ~/.cache/lte-r-reference).
# docs/reference-comparisons.md describes the set-up and what is compared.
set -euo pipefail
cd "$(dirname "$0")/../.."

install=0
webr=0
parts=()
for arg in "$@"; do
  case "$arg" in
    --install) install=1 ;;
    --webr) webr=1 ;;
    --) ;;
    *) parts+=("$arg") ;;
  esac
done

command -v Rscript >/dev/null || { echo "Rscript not found: install R first (docs/reference-comparisons.md)." >&2; exit 1; }
if [ "$install" = 1 ]; then Rscript scripts/reference/install.R; fi

# The mixed-model inputs come from the app's own preparation code.
if [ "${#parts[@]}" = 0 ] || [[ " ${parts[*]} " == *" mixed "* ]]; then
  if [ "$webr" = 1 ]; then
    node scripts/reference/mixed_model_inputs.mjs --webr
  else
    node scripts/reference/mixed_model_inputs.mjs
  fi
fi
Rscript scripts/reference/generate.R "${parts[@]}"
