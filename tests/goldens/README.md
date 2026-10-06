# Golden fixture provenance

The JSON files here began as outputs from the separate Python `analyses`
package. `scripts/gen_goldens.py` records the original generation functions
and the paths of its source workbooks. The generator needs that separate
checkout and is a historical reference, not an automatic source of truth for
the TypeScript implementation. The synthetic Theil–Sen cases have a more
specific [reference record](theil_sen.md), including the Python commit and
library versions used for their last deliberate regeneration.

Since the 2026-10-06 [method decision](../../docs/remaining-method-decisions.md),
these fixtures are regression snapshots for the web core. A passing parity
test establishes agreement with the stored case, not clinical validity or
agreement with every current Python behavior. When an approved method change
changes a value, update the affected fixture deliberately and record the input,
old and new result, reason, and generating code or calculation in the method
documentation and changelog. Keep unaffected fixtures intact.
