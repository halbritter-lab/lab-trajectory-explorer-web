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
session downloads the R runtime from `webr.r-wasm.org` and R packages from
`repo.r-wasm.org`, so cohort models need access to both hosts.

## License

MIT © 2026 Jan-Paul Lerch
