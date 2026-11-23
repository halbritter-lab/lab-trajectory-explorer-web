# Installs the R packages the reference cases are generated with (issue #79).
# Research use only. Run through `scripts/reference/generate.sh --install`
# from the repository root.
#
# The lme4 stack is pinned to the versions in src/core/mixedModel/rRuntimePins.json
# (the packages the browser fit uses) and installed from CRAN source (current or
# Archive). nloptr is the exception: the browser serves the development version
# 2.2.1.9000, which CRAN does not carry; the release nloptr 2.2.1 is installed
# instead (docs/reference-comparisons.md). The other packages are the CRAN
# versions in REFERENCE_PACKAGES below; every generated file records the
# versions it was produced with.
options(download.file.method = "libcurl", repos = c(CRAN = "https://cran.r-project.org"))
lib <- Sys.getenv("R_REFERENCE_LIB", file.path(Sys.getenv("HOME"), ".cache", "lte-r-reference"))
dir.create(lib, recursive = TRUE, showWarnings = FALSE)
.libPaths(c(lib, .libPaths()))
ncpus <- max(1L, parallel::detectCores() - 1L)

# Name/version pairs of the pins, read without jsonlite (not installed yet).
pins <- local({
  text <- paste(readLines("src/core/mixedModel/rRuntimePins.json", warn = FALSE), collapse = "\n")
  m <- regmatches(text, gregexpr('"name": "[^"]+", "version": "[^"]+"', text))[[1]]
  setNames(sub('.*"version": "([^"]+)"', "\\1", m), sub('"name": "([^"]+)".*', "\\1", m))
})
pins[["nloptr"]] <- "2.2.1"

# Further packages: the CRAN versions current on 2026-11-22.
REFERENCE_PACKAGES <- c(
  numDeriv = "2016.8-1.1", lmerTest = "3.2-1", survival = "3.8-12",
  mblm = "0.12.1", Kendall = "2.2.2", zyp = "0.11-1", egfr = "2.0.0", kidney.epi = "1.4.0", epocakir = "1.0.0"
)

installed_version <- function(pkg) {
  tryCatch(as.character(packageVersion(pkg, lib.loc = lib)), error = function(e) NA_character_)
}

install_exact <- function(pkg, version) {
  if (identical(installed_version(pkg), as.character(package_version(version)))) return(invisible())
  file <- sprintf("%s_%s.tar.gz", pkg, version)
  urls <- c(sprintf("https://cran.r-project.org/src/contrib/%s", file),
            sprintf("https://cran.r-project.org/src/contrib/Archive/%s/%s", pkg, file))
  dest <- file.path(tempdir(), file)
  ok <- FALSE
  for (u in urls) if (!ok) {
    ok <- tryCatch({ download.file(u, dest, quiet = TRUE); TRUE },
                   error = function(e) FALSE, warning = function(w) FALSE)
  }
  if (!ok) stop("Cannot download ", file)
  install.packages(dest, lib = lib, repos = NULL, type = "source", Ncpus = ncpus)
  if (!identical(installed_version(pkg), as.character(package_version(version)))) {
    stop("Installation of ", pkg, " ", version, " failed")
  }
}

# The pinned lme4 stack in dependency order.
stack <- c("Rcpp", "RcppEigen", "lattice", "Matrix", "MASS", "boot", "nlme", "minqa",
           "nloptr", "rbibutils", "Rdpack", "reformulas", "jsonlite", "lme4")
for (pkg in stack) install_exact(pkg, pins[[pkg]])

# The rest, with whatever CRAN dependencies they still need (latest versions).
for (pkg in names(REFERENCE_PACKAGES)) {
  deps <- tools::package_dependencies(pkg, which = c("Depends", "Imports", "LinkingTo"), recursive = TRUE)[[1]]
  have <- c(rownames(installed.packages(priority = "base")), rownames(installed.packages(lib.loc = lib)))
  missing <- setdiff(deps, have)
  if (length(missing)) install.packages(missing, lib = lib, Ncpus = ncpus)
  install_exact(pkg, REFERENCE_PACKAGES[[pkg]])
}
cat("Installed into", lib, "\n")
print(installed.packages(lib.loc = lib)[, "Version"])
