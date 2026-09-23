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

The fixture was extended on 2026-09-23 using the same Python reference, with
two-point, interior confidence-rank and tied-time/value cases. The parity test
now verifies **all estimator fields**: slope, intercept, reason, R² and both
95% slope confidence bounds. Direct tests additionally cover input ordering.

| Convention | Web | Python reference |
| --- | --- | --- |
| Minimum point count | 3 | 3 |
| Intercept | `median(y) - slope*median(x)` | `median(y) - slope*median(x)` |
| Slope CI | Non-parametric 95% confidence bounds | Non-parametric 95% confidence bounds |

For the four-point case `[0, 0, 4, 9]` at years `[0, 1, 2, 3]`, both slopes
are 3.5 and both intercepts are −3.25. The former web intercept was −2.25;
this intentional numerical change follows the owner's approved decision for
issue #6. Two-point fits are now unavailable. See
[algorithm details](../../docs/method-algorithms.md) for rank formulas and
limitations. Numerical agreement is not research-data acceptance.
