# Lab Trajectory Explorer

## Development status and open requirements

The [requirements reconciliation](docs/requirements-reconciliation.md) connects analysis findings, decisions, issues and outstanding problems. The [workspace prototype](prototypes/analysis-workspace/README.md) and its [feature inventory](prototypes/analysis-workspace/feature-audit.md) document the UI redesign. Integration and publication follow the [release rules](docs/release-process.md).

[Open the Lab Trajectory Explorer online](https://halbritter-lab.github.io/lab-trajectory-explorer-web/)

All parsing and computation runs in the browser; no data leaves the machine.

## Develop

The [real-data workspace](docs/workspace-real-data.md) is available at
`/workspace.html`. It implements the first complete workflow from the UI design;
the existing interface at `/index.html` remains available during acceptance.

This project uses [pnpm](https://pnpm.io/) (pinned via the `packageManager`
field; run `corepack enable` once to let Node provision it automatically).

```bash
cd web
pnpm install
pnpm dev         # http://localhost:5173
pnpm test        # vitest
pnpm build       # static site -> web/dist/
```

## License

MIT © 2026 Jan-Paul Lerch
