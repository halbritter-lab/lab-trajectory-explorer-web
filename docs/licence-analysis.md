# Licence analysis: the R runtime served with the app

**Draft of 2026-11-22 for issue #80 (decision `release`). This is not legal
advice.** It is a technical inventory written to prepare questions for the
owner and, where needed, for legal counsel. It describes what the build
ships and what the licences of the shipped components usually require; it
does not decide whether a requirement applies or is met. Licence texts, not
this summary, are binding.

## What is distributed

Since the decision of 2026-11-21 (K43, implemented 2026-11-22) every build,
and with it every deployment to GitHub Pages, serves next to the app:

| Component | Version | Licence (as pinned) | Served as |
| --- | --- | --- | --- |
| webR (R compiled to WebAssembly) | 0.6.0, R 4.6.0 | GPL-3 for the binaries, which contain R and libgfortran; MIT for webR's own scripts | `webr/` (binaries and `webr/LICENSE.md`) |
| lme4 | 2.0-6 | GPL (>= 2) | binary + CRAN source |
| Matrix | 1.7-6 | GPL (>= 2) \| file LICENCE (contains SuiteSparse parts under BSD-3-Clause, LGPL-2.1+, GPL-2+, Apache-2.0) | binary + CRAN source |
| jsonlite | 2.0.0 | MIT + file LICENSE | binary + CRAN source |
| MASS | 7.3-66 | GPL-2 \| GPL-3 | binary + CRAN source |
| Rcpp | 1.1.2 | GPL (>= 2) | binary + CRAN source |
| Rdpack | 2.6.6 | GPL (>= 2) | binary + CRAN source |
| boot | 1.3-32 | Unlimited | binary + CRAN source |
| lattice | 0.23-1 | GPL (>= 2) | binary + CRAN source |
| minqa | 1.2.8 | GPL-2 | binary + CRAN source |
| nlme | 3.1-171 | GPL (>= 2) | binary + CRAN source |
| nloptr | 2.2.1.9000 (development version) | LGPL (>= 3) | **binary only** |
| rbibutils | 2.4.1 | GPL-2 | binary + CRAN source |
| reformulas | 0.4.4 | GPL-3 | binary + CRAN source |
| RcppEigen (compiled into lme4; contains Eigen 3.4.0, MPL-2.0) | 0.3.4.0.2 (most likely) | GPL (>= 2) \| file LICENSE | CRAN source only (header-only) |

Source of the table: `src/core/mixedModel/rRuntimePins.json`, the licence
fields of which the build checks against each package's DESCRIPTION
(`scripts/vendor_r_runtime.mjs`). According to `webr/LICENSE.md`, the webR
binaries further contain PCRE2 (BSD), XZ Utils (public domain), libgfortran
(GPL), and the file system image holds Noto fonts (SIL Open Font License);
webR's licence file also names jsTree and xterm.js (MIT) and LLVM Flang
(Apache-2.0) as software included in its repository or build.

The app itself is MIT (`LICENSE`). Its JavaScript bundle also contains
third-party npm packages: React and React DOM (MIT), zustand (MIT), fflate
(MIT), idb-keyval (Apache-2.0), SheetJS `xlsx` 0.20.3 (Apache-2.0) and the
JavaScript API of `webr` (MIT per webR's licence file).

The git repository does not contain the R runtime or the packages
(`public/webr/`, `public/r-packages/`, `public/licenses/` and
`public/THIRD-PARTY-NOTICES.txt` are ignored); they are fetched at build
time. Distribution therefore happens through the deployed site (and any
copy of a build that someone passes on), not through the repository.

## Obligations that usually apply

Summaries only; see the licence texts.

- **GPL-2 and GPL-3, object code** (R, webR binaries and most packages).
  Conveying the compiled form requires making the complete corresponding
  source available. GPL-2 section 3 accepts source "accompanying" the
  binaries, a written offer, or, where the binaries are offered for copying
  from a designated place, "equivalent access to copy the source code from
  the same place". GPL-3 section 6(d) also accepts access from a designated
  place, which may be a different server, including one run by a third
  party, provided there are clear directions next to the object code and
  the distributor ensures that the source stays available as long as the
  object code is offered. "Corresponding source" includes the scripts used
  to control compilation and installation (GPL-2 section 3; GPL-3
  section 1).
- **Licence texts and notices.** Copies must carry the copyright and licence
  notices and a copy of the licence (GPL-2 section 1; GPL-3 sections 4–5).
- **LGPL-3** (nloptr). Built on GPL-3; conveying object code of the library
  requires its corresponding source under GPL-3 section 6 as well, plus the
  LGPL-3 and GPL-3 texts and a notice that the library is used and covered
  by the LGPL.
- **MPL-2.0** (Eigen, compiled into lme4). Executable distribution requires
  that the source of the MPL-covered files is available and that recipients
  are told how to obtain it (MPL-2.0 section 3.2).
- **MIT, BSD.** Keep the copyright notice and the permission notice in all
  copies or substantial portions.
- **Apache-2.0** (idb-keyval, SheetJS `xlsx`, parts of SuiteSparse). Give
  recipients a copy of the licence, keep copyright notices, and pass on a
  `NOTICE` file where the component has one (section 4).
- **SIL Open Font License** (Noto fonts in the webR file system). The fonts
  may be bundled with software, provided each copy carries the copyright
  notice and the licence.
- **Relation to the MIT app.** GPL-3 section 5 (last paragraph) and GPL-2
  section 2 (last paragraphs) distinguish a work based on the program from
  an "aggregate" of separate works on one distribution medium. The app and
  webR run as separate programs: the app sends R code and data to R in a web
  worker as messages and reads results back
  (`THIRD-PARTY-NOTICES.txt` describes them this way). Whether that keeps
  them separate works is a legal judgement, see the questions below.

## What is in place

- **Pinned, verified components.** Every binary and source archive is
  checked against a SHA-256 pin; the build fails on any difference, so a
  deployment ships exactly the listed versions
  (`scripts/vendor_r_runtime.mjs`, `rRuntimePins.json`).
- **Source packages from the same place.** The CRAN source package of every
  R package that has one is served at `r-packages/src/contrib/` beside the
  binaries, unmodified as published on CRAN (about 15.5 MB). This covers the
  GPL-2-only packages (minqa, rbibutils, MASS under its GPL-2 option) by the
  "same place" route of GPL-2 section 3, and RcppEigen with Eigen for the
  MPL-2.0. The build stops when a pinned binary names under `LinkingTo` a
  package whose source is not pinned (`uncoveredLinkingTo`).
- **Notices.** `THIRD-PARTY-NOTICES.txt` at the site root lists each R
  component with version, licence and where its source is; `licenses/`
  holds GPL-2, GPL-3, LGPL-3 (copied from R 4.6.0), MIT, `jsonlite-LICENSE`,
  `Matrix-LICENCE`, `RcppEigen-LICENSE` and `RcppEigen-COPYRIGHTS` (with the
  MPL-2.0 text). `webr/LICENSE.md`, webR's own licence file with the MIT and
  GPL-3 texts, is served unchanged.
- **Sources of webR and R named.** The notices point to
  `https://github.com/r-wasm/webr/tree/v0.6.0` and to the CRAN source of
  R 4.6.0.
- **Unmodified.** The notices state that runtime and packages are served
  unmodified.
- **Documentation.** The README and `docs/release-process.md` say that the
  build ships these files and must contain them before a release.

## What is missing or uncertain

1. **nloptr has no served source.** nloptr 2.2.1.9000 is a development
   version with no CRAN source package. The binary does not record the
   revision it was built from; the notices name the most likely GitHub
   commit (`5fd8ea7e…`, 2025-08-13) and the r-universe build, marked as not
   confirmed. Under LGPL-3 / GPL-3 section 6 the corresponding source of the
   exact binary has to be available; a probable commit on a third-party
   server may not meet that. Options to weigh: obtain the exact source from
   the builders of the webR repository and serve it; rebuild nloptr from a
   known source and pin that binary; or pin a CRAN release of nloptr if lme4
   accepts it. Changing the pinned version is a method decision (OD-21 pins;
   the fit's numbers must be checked).
2. **R and webR sources are linked, not served.** For the webR binaries
   (GPL-3) the GPL-3 section 6(d) route allows a third-party server, but the
   distributor has to ensure availability for as long as the binaries are
   served, and the source must correspond to the binaries (webR's patches
   to R and its build scripts are in the webR repository at the tag). R
   itself is GPL-2 | GPL-3; webR distributes the binaries under GPL-3.
   Serving the two archives (R-4.6.0.tar.gz and the webR v0.6.0 source)
   next to `webr/` would remove the dependence on third-party hosts, at the
   cost of deployment size.
3. **Build scripts of the wasm binary packages are not named.** The
   packages are webR builds from `repo.r-wasm.org`; the served sources are
   the CRAN sources. Whether the r-wasm build tooling (and any patches it
   applies) counts as part of the corresponding source of these binaries,
   and should be named or served, is open.
4. **RcppEigen version not confirmed.** The lme4 binary does not record the
   RcppEigen version it was compiled with; 0.3.4.0.2 is the most likely one
   (the notices say so).
5. **libgfortran.** `webr/LICENSE.md` lists it as GPL-2 and GPL-3; GCC's
   runtime libraries are usually distributed under GPL-3 with the GCC
   Runtime Library Exception. The notices do not mention the exception.
6. **Noto fonts.** The fonts are inside webR's packed file system;
   `webr/LICENSE.md` names the SIL Open Font License but does not contain
   its text, and no OFL text is among `licenses/`. Not checked: whether the
   packed file system contains it.
7. **Notices for the JavaScript bundle.** `THIRD-PARTY-NOTICES.txt` covers
   the R side only. The app bundle keeps the short licence headers of React
   and SheetJS (seen in a local build, not checked for this branch), but no
   notice file lists the npm dependencies, and the Apache-2.0 text required
   for idb-keyval and SheetJS `xlsx` is not shipped.
8. **The app's own licence is not in the build.** `LICENSE` is in the
   repository but not in the deployed files. The authors are not bound by
   their own licence, but anyone who passes on a copy of the build needs the
   MIT notice, so shipping `LICENSE` beside `THIRD-PARTY-NOTICES.txt` would
   help.
9. **Notices are not linked from the interface.** The files are at the site
   root, but no page of the app points to them. GPL-3 section 6(d) asks for
   "clear directions next to the object code saying where to find the
   Corresponding Source"; whether a file at the root of the same site is
   enough is a question below.

## Questions for the owner and, where needed, legal counsel

1. Who distributes the site in the sense of the licences: the maintainer,
   the laboratory or institution, or both? Whose name goes on the source
   offer and the notices?
2. Is serving the app (MIT) and webR with GPL packages on one site an
   aggregate of separate programs, so that the app's MIT licence is
   unaffected? Does the exported R script (`r_script`, which calls lme4)
   raise any question?
3. Is a probable-commit pointer acceptable for nloptr until an exact source
   is obtained, or must the binary be replaced before the next release? Is
   replacing it (a method decision with a check of the fit's numbers)
   wanted?
4. Are third-party links for the R and webR sources acceptable for as long
   as the site serves the binaries, or should the archives be served from
   the site?
5. Do the r-wasm build scripts need to be named or served as part of the
   corresponding source of the binary packages?
6. Should the notices name the GCC Runtime Library Exception for
   libgfortran, and should the OFL text be added for the Noto fonts?
7. Should the build ship a notices file for the npm dependencies (and the
   Apache-2.0 text), and the app's own `LICENSE`?
8. Should the app link to `THIRD-PARTY-NOTICES.txt` (for example from
   Methods → Limitations & sources or the footer)?
9. Do institutional rules (for example of the university or hospital that
   hosts the research) add requirements for publishing GPL software?

## References in the repository

- Pins and licences: `src/core/mixedModel/rRuntimePins.json`
- Build step, notices and licence copies: `scripts/vendor_r_runtime.mjs`
- Licence texts copied into the build: `third-party/licenses/`
- Decision: [R served with the app](remaining-method-decisions.md#decisions-of-2026-11-22-r-served-with-the-app-k43-issue-75)
- Release rules: [release process](release-process.md#r-runtime-and-r-packages)
