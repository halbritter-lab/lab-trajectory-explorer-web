# Theil–Sen reference fixture

`theil_sen.json` was generated with `scripts/gen_goldens.py:gen_theil_sen`
from `analyses.methods._theil_sen_estimator` in the local
`lab-trajectory-explorer` checkout at commit
`36a2e6492d65387af296de108d6eed329213f371`, using pandas 3.0.2 and SciPy 1.17.1.
All observations are synthetic.

To regenerate only this fixture from the web repository root, set `PYTHONPATH`
to the checkout containing the Python `analyses` package, then run:

```sh
python -B -c "import json; from scripts.gen_goldens import gen_theil_sen, OUT_DIR; (OUT_DIR / 'theil_sen.json').write_text(json.dumps(gen_theil_sen(), indent=2), encoding='utf-8')"
```

The parity test verifies **slope, reason, and R² on the shared input domain**.
The fixture retains every Python output field for inspection. This does not
establish full estimator parity:

| Convention | Web | Python reference |
| --- | --- | --- |
| Minimum point count | 2 | 3 |
| Intercept | `median(y - slope*x)` | `median(y) - slope*median(x)` |
| Slope CI | Unavailable (`NaN`) | Non-parametric confidence bounds |

For the four-point case `[0, 0, 4, 9]` at years `[0, 1, 2, 3]`, both slopes
are 3.5, but the intercepts are −2.25 (web) and −3.25 (Python). Two-point
behavior and the other web conventions are covered by direct tests in
`tests/core/stats/theilSen.test.ts`. Production behavior is unchanged; resolving
these differences remains a separate statistics decision for issue #6.
