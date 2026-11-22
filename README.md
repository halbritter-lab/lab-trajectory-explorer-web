# Lab Trajectory Explorer

## Development status and open requirements

The [workspace completion backlog](docs/workspace-completion-backlog.md) tracks current implementation and acceptance work. The historical [requirements reconciliation](docs/requirements-reconciliation.md) connects analysis findings, decisions, issues and outstanding problems. The [workspace prototype](prototypes/analysis-workspace/README.md) and its [feature inventory](prototypes/analysis-workspace/feature-audit.md) document the UI redesign. Integration and publication follow the [release rules](docs/release-process.md).

[Open the Lab Trajectory Explorer online](https://halbritter-lab.github.io/lab-trajectory-explorer-web/)

All parsing and computation runs in the browser. Import, trajectories and
exports make no network requests beyond loading the app from the address it
is served from. The first cohort model fit of a session downloads the R
runtime and R packages (see [Run a local copy](#run-a-local-copy)); these are
downloads only, and no measurements are sent.

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

Without an installation, use the
[online version](https://halbritter-lab.github.io/lab-trajectory-explorer-web/).

A local copy is the static site that `pnpm build` writes to `dist/`, served
by a static file server. Opening `dist/index.html` by double-click (a
`file://` address) does not work: browsers block the application's script
there, and the page shows a notice that links to the online version instead.
One way, on a computer with Python 3:

```bash
python3 -m http.server --directory dist   # then open http://localhost:8000
```

On a development machine `pnpm preview` serves the same folder at
`http://localhost:4173`.

There is no offline variant. Import, trajectories and exports work without
internet access once the page is loaded. The first cohort model fit of a
session downloads the R runtime from `webr.r-wasm.org` and R packages from
`repo.r-wasm.org`, so cohort models need access to both hosts.

## License

MIT © 2026 Jan-Paul Lerch
