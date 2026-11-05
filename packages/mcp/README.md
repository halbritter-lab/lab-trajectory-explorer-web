# lab-trajectory-mcp

A local [MCP](https://modelcontextprotocol.io) server that analyses
lab-trajectory workbooks with the
[kidney-trajectories package](../kidney/README.md). It loads a workbook from a
local path and runs the cohort pipeline of the
[Lab Trajectory Explorer](../../README.md): computed eGFR, per-patient slope
fits with a preset, KDIGO AKI exclusion, event censoring, observed CKD
endpoints and the linear G5 projection.

**Research use only. Not a medical device, not for clinical decisions.** Every
tool result carries this statement. Results are descriptive summaries of
laboratory series, not a diagnosis or a prognosis.

## Data protection: read this first

The server runs on your machine and talks to the MCP client over stdio only. It
opens no network port and accepts only local file paths. But **everything a tool
returns is sent to the MCP client and from there to the model provider**
(Anthropic for Claude). Therefore:

- **Use pseudonymised data only.** Never load workbooks with names, full birth
  dates or hospital identifiers you are not allowed to share with the model
  provider. A workbook may contain birth dates: they stay in server memory and
  are never returned, but pseudonymise anyway.
- **Default results are aggregate, but aggregates are not anonymous.**
  `load_dataset`, `list_series` and `analyse_cohort` return counts,
  distributions and settings, never patient IDs. Row-level import messages
  are counted, not listed, and an unreadable file gets a generic error,
  because both can quote raw cell values. **Aggregates of a small cohort are
  still personal data:** the median slope of one patient is that patient's
  slope. Counts from 1 to 4 are therefore reported as `"<5"`, slope quartiles
  need at least 5 slopes, and no minimum or maximum is reported. This reduces
  the risk; it does not anonymise the results. The threshold is open owner
  decision OD-31 in the [method reference](../../docs/method-algorithms.md).
- **`patient_detail` returns patient-level results** for one patient ID that
  you name. Its tool description says so. Use it only when you need one patient
  in the conversation.
- **Prefer `export_cohort` for patient-level results.** It writes the
  per-patient table to a local file and returns only the path and the row
  count, so the patient rows never pass through the model.

The server writes only where `export_cohort` is told to, and never overwrites
an existing file.

Paths must be absolute and local. URLs, network shares and Windows device paths
are rejected in every spelling (`\\host`, `//host`, `/\host`, `\\?\UNC\…`,
`\\.\…`), also when a symlink or junction leads there: the server resolves the
file it reads, and the folder it writes to, before using them. Two limits:
resolving a symlink that points to a share already contacts that share once,
and a network drive mapped to a letter (`Z:`) is not detected.

Loaded datasets stay in memory until `unload_dataset` or the end of the
session. Loading the same unchanged file again returns its existing id; a
changed file replaces the earlier data under that id. Files over 200 MB
(`MAX_FILE_BYTES`) are refused.

## Build

Node 20.11 or later. From the repository root:

```sh
pnpm install
pnpm build:kidney   # the package the server imports
pnpm build:mcp      # packages/mcp/dist
pnpm test:mcp       # in-process server tests (Vitest)
```

The entry point is `packages/mcp/dist/index.js` (bin name
`lab-trajectory-mcp`). Nothing is published to a registry.

## Configure

Use the absolute path of `dist/index.js` in your clone.

**Claude Code:**

```sh
claude mcp add lab-trajectory -- node /absolute/path/to/lab-trajectory-explorer-web/packages/mcp/dist/index.js
```

**Claude Desktop** (`claude_desktop_config.json`, then restart the app):

```json
{
  "mcpServers": {
    "lab-trajectory": {
      "command": "node",
      "args": ["/absolute/path/to/lab-trajectory-explorer-web/packages/mcp/dist/index.js"]
    }
  }
}
```

On Windows, write the path as `C:/Users/.../packages/mcp/dist/index.js` or
with escaped backslashes in JSON.

## Tools

| Tool | Returns | Patient-level |
| --- | --- | --- |
| `load_dataset(path)` | Dataset id, patients, lab rows, series with units and row counts, events, attribute rows, import diagnostics (sheet notes, counted row messages) | No |
| `unload_dataset(dataset_id)` | Removes the dataset from memory | No |
| `list_series(dataset_id)` | Series with unit, rows and patients; computable eGFR series and creatinine sources | No |
| `analyse_cohort(dataset_id, series?, unit?, preset, egfr_formula?, creatinine_source?)` | Patients analysed, slope median and IQR, unstable share, no-fit reasons, rapid decline count, AKI counts, excluded points by reason, observed endpoints, projection counts, and the exact method settings | No |
| `patient_detail(..., patient_id)` | One patient's cohort export record (slope, CI, r², n, span, reason, flags, endpoints), fitted points, fitted span, distinct dates, excluded points by reason, AKI episodes and windows | **Yes** |
| `export_cohort(..., output_path)` | Writes `.xlsx` (sheets `cohort`, `settings`, `about`) or `.csv` (research-use notes as leading `#` lines; read with `comment='#'` in pandas or `comment.char = "#"` in R); returns path and row count | Written to file only |
| `methods_reference()` | Link to the method reference, presets, eGFR equations, export notes | No |

`preset` is one of `general_exploration`, `theil_sen`, `ckd_progression`
(default) and `acute_review`. `egfr_formula` is one of the equations the
kidney package offers (`methods_reference` lists them, for example
`ckd-epi-2021`). It computes eGFR from serum creatinine as the app does;
without `series` the computed eGFR series is analysed.

Example prompt: *"Load /data/pseudonymised/labs.xlsx, analyse computed
CKD-EPI 2021 eGFR with the CKD progression preset, and export the per-patient
results to /data/out/cohort.xlsx."*

## Methods

The server adds no analysis logic. It calls the package functions the app uses
(`computeAnalysisResult`, `exactBirthDateByPatient`, `cohortSeriesSpec`,
`buildCohortRows`, `cohortExportRecords`, `cohortSheetRecord`) with the app's
defaults and no manual demographics, so the numbers and the export columns
match the app for the same workbook and settings. The aggregates count and
summarise those results; quartiles use linear interpolation (R type 7), and
small cells are suppressed. Every rule, boundary and worked example is specified in the
[method reference](../../docs/method-algorithms.md).

Pitfalls carried over from the core: `n` counts raw measurements before
exclusions and balancing (`n_fitted` counts fitted points), and a two-point fit
reports `r2 = 1`; `unstable_slope` flags such slopes.

Not included: mixed models (webR runs only in a browser), charts, manual
demographic overrides, per-column rapid-decline thresholds (the default of 5
per year applies), and choosing a sheet by name (the labs, events and
attributes sheets are detected as in the app).

## License

MIT, as the repository. SheetJS is licensed separately under Apache-2.0.
