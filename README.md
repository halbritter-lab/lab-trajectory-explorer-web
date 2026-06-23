# Lab Trajectory Explorer — Web (TypeScript port)

Client-side, no-install browser port of the Streamlit app. All parsing and
computation runs in the browser; no data leaves the machine.

## Develop

This project uses [pnpm](https://pnpm.io/) (pinned via the `packageManager`
field; run `corepack enable` once to let Node provision it automatically).

```bash
cd web
pnpm install
pnpm dev         # http://localhost:5173
pnpm test        # vitest (core + IO + parity)
pnpm build       # static site -> web/dist/
```

## Parity with the Python core

The numeric/IO core is a port of the `analyses` Python package. Parity is
enforced by golden fixtures generated from the Python source:

```bash
# from the repo root, in the Python env that has `analyses` installed
python web/scripts/gen_goldens.py
```

This regenerates `web/tests/goldens/*.json`, which the `tests/parity/*` suites
assert against within float tolerance (`fitOls`) or exact equality (`parseWert`).
Regenerate after changing any ported Python kernel, then re-run `pnpm test`.

## License

MIT © 2026 Jan-Paul Lerch
