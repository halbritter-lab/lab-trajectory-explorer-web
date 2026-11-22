# Lab Trajectory Explorer

## Development status and open requirements

The [workspace completion backlog](docs/workspace-completion-backlog.md) tracks current implementation and acceptance work. The historical [requirements reconciliation](docs/requirements-reconciliation.md) connects analysis findings, decisions, issues and outstanding problems. The [workspace prototype](prototypes/analysis-workspace/README.md) and its [feature inventory](prototypes/analysis-workspace/feature-audit.md) document the UI redesign. Integration and publication follow the [release rules](docs/release-process.md).

[Open the Lab Trajectory Explorer online](https://halbritter-lab.github.io/lab-trajectory-explorer-web/)

All parsing and computation runs in the browser; no data leaves the machine.

## Develop

The application is the [real-data workspace](docs/workspace-real-data.md),
served at `/` (`index.html`). The former interface was removed on 2026-10-06;
`/workspace.html` only redirects to `index.html` so older links keep working.

This project uses [pnpm](https://pnpm.io/) (pinned via the `packageManager`
field; run `corepack enable` once to let Node provision it automatically).

```bash
pnpm install
pnpm dev         # http://localhost:5173
pnpm test        # vitest
pnpm build       # static site -> dist/
```

## Run a local copy

`pnpm build` writes a static site to `dist/`. It needs a web server: opening
`dist/index.html` directly from a folder (`file://`) does not start the
application, because browsers block its script there; the page then shows a
notice instead. Serve the folder with any static web server and open its
`http://` address, for example:

```bash
pnpm preview                              # http://localhost:4173
python3 -m http.server --directory dist   # http://localhost:8000
```

There is no offline variant. Import, trajectories and exports work without
internet access once the page is loaded. The first cohort model fit of a
session loads the R runtime and R packages (about 39 MB) from the same address
as the app; no other host is contacted.

### R runtime and R packages

Every build serves webR 0.6.0 (R 4.6.0) and a pinned set of R packages next to
the app. `pnpm build` and `pnpm dev` first run `scripts/vendor_r_runtime.mjs`
(also `pnpm vendor:r`), which copies the runtime from the installed npm
package `webr` and downloads the package archives from
`repo.r-wasm.org` and their sources from CRAN into `public/` (ignored by git;
files already in place are checked, not downloaded again). Every file is
checked against the SHA-256 in `src/core/mixedModel/rRuntimePins.json`; a
difference stops the build. The build therefore needs network access to
`repo.r-wasm.org` and `cran.r-project.org` unless `public/r-packages/` is
already filled. The deployed site is about 82 MB, of which 47.7 MB runtime,
17.4 MB package archives and 15.5 MB package sources. A static host must
serve the `.gz` files below `webr/` as they are, without
`Content-Encoding: gzip`.

`THIRD-PARTY-NOTICES.txt` in the build lists each component with version,
licence and source; the licence texts are in `licenses/`. The app is MIT
licensed; R, webR and most of the packages are under the GNU GPL.

## License

MIT © 2026 Jan-Paul Lerch
