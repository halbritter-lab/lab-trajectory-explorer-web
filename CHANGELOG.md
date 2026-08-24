# Changelog

This project follows [Semantic Versioning](https://semver.org/) while its public
interfaces are still evolving before 1.0.

## [Unreleased]

### Added

- Cohort and single-patient exports gained a `demographics_conflict` column
  flagging patients whose sex or age could not be resolved without
  contradiction.
- The cohort can now be grouped by sex without a second spreadsheet.

### Changed

- Sex and age are now resolved once per patient before any analysis runs,
  rather than being read from each lab row individually; contradictions
  between rows (or between rows, the attributes table, and a manual entry)
  are reported instead of silently computed over.

### Fixed

- A manually entered age now ages across the series instead of being applied
  unchanged to every row. This corrects a real error: on an eight-year series,
  the old behaviour left the patient the same age at both ends, roughly an
  eight percent eGFR error at the later end, in the direction that makes a
  decline look flatter than it is.
- eGFR values will change for any dataset whose stated ages do not fit a
  single birth date — this includes the common export shape of one
  age-at-export value repeated on every row of a patient, which is
  contradictory by construction. Measured on the shipped demo workbook
  (regenerated on this branch to resolve without conflict): 54 of 118
  computed eGFR rows moved, across 10 of 14 patients; largest absolute change
  0.8 ml/min/1.73m², largest relative change 1.86%.

## [0.2.0] - 2026-08-24

### Added

- Visible slope-quality warnings and explicit reasons when no CKD G5 projection
  is available.
- Canonical camelCase import headers with backward-compatible aliases, broader
  sex-value parsing, and downloadable empty templates.
- Fit-estimator and unstable-slope metadata in cohort and patient exports.
- Pull-request CI and browser regression coverage for the new import, quality,
  endpoint, download, and mobile methodology paths.

### Fixed

- Reliability checks now use the measurements and span retained after
  censoring, exclusions, and time balancing without changing reference-parity
  reason codes.
- Exported fit-model metadata now identifies the estimator that produced the
  scalar slope.
- Ambiguous recognized import headers are rejected without rejecting harmless
  collisions among unrelated metadata columns.

## [0.1.0] - 2026-07-07

- Initial deployed baseline.

[Unreleased]: https://github.com/halbritter-lab/lab-trajectory-explorer-web/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/halbritter-lab/lab-trajectory-explorer-web/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/halbritter-lab/lab-trajectory-explorer-web/releases/tag/v0.1.0
