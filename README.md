# Lab Trajectory Explorer

[Open the Lab Trajectory Explorer online](https://halbritter-lab.github.io/lab-trajectory-explorer-web/)

All parsing and computation runs in the browser; no data leaves the machine.

## Develop

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
