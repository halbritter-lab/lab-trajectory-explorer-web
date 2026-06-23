"""Generate golden fixtures from the Python analyses package for TS parity tests.

Run from the repo root:  python web/scripts/gen_goldens.py
Writes JSON into web/tests/goldens/.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import pandas as pd

from analyses.lab_explorer import _parse_wert, load_lab_excel, summarize_by_bezeichnung, fit_segments, _rolling_slopes_for_series
from analyses.methods import _fit_ols_impl, apply_preset, find_kdigo_aki_episodes
from analyses.egfr import ckdepi_2021, mdrd_4, append_computed_egfr

OUT_DIR = Path(__file__).resolve().parent.parent / "tests" / "goldens"
DATA = Path(__file__).resolve().parent.parent.parent / "analyses" / "data" / "test_labs_clustered.xlsx"
EGFR_DATA = Path(__file__).resolve().parent.parent.parent / "analyses" / "data" / "test_labs.xlsx"


def _num(x: float) -> float | None:
    return None if x is None or (isinstance(x, float) and math.isnan(x)) else x


def gen_wert() -> list[dict]:
    inputs = [
        "42", "3.5", "3,5", "<30", ">200", "≤30", "≥200",
        "10-20", "10–20", "1.234", "1.234,5", "positiv", "1e3",
        "", "   ", "<  5", "0,0", "-2.5",
    ]
    rows = []
    for raw in inputs:
        p = _parse_wert(raw)
        rows.append({
            "raw": raw,
            "value": _num(p.value),
            "operator": p.operator,
        })
    return rows


def _iso(ts) -> str | None:
    """Return ISO-8601 string with explicit UTC marker ('Z') so that
    JavaScript ``new Date(str)`` interprets it as UTC, matching Python's
    naive-timestamp arithmetic where subtraction yields wall-clock deltas."""
    return None if pd.isna(ts) else pd.Timestamp(ts).isoformat() + "Z"


def gen_segments_rolling_summary() -> dict:
    df = load_lab_excel(DATA)
    seg_cases, roll_cases, sum_cases = [], [], []
    for pid in sorted(df["PatientID"].unique()):
        sub = df[df["PatientID"] == pid]
        for (bez, einheit), group in sub.groupby(["Bezeichnung", "Einheit"], dropna=False, sort=False):
            numeric = group.dropna(subset=["Wert_num"]).sort_values("LabDatum")
            if numeric.empty:
                continue
            pts = [
                {"date": _iso(r.LabDatum), "value": float(r.Wert_num)}
                for r in numeric.itertuples()
            ]
            segs = fit_segments(numeric[["LabDatum", "Wert_num"]], gap_days=180, min_n_per_segment=3)
            seg_cases.append({
                "points": pts,
                "segments": [
                    {"n": int(s["n"]), "fittable": bool(s["fittable"]),
                     "slope": _num(s["slope"]), "intercept": _num(s["intercept"]), "r2": _num(s["r2"])}
                    for s in segs
                ],
            })
            rolls = _rolling_slopes_for_series(numeric[["LabDatum", "Wert_num"]], window_days=730, step_days=180, min_n_per_window=3)
            roll_cases.append({
                "points": pts,
                "windows": [
                    {"nInWindow": int(r.n_in_window), "slope": _num(r.slope), "r2": _num(r.r2)}
                    for r in rolls.itertuples()
                ],
            })
    for pid in sorted(df["PatientID"].unique()):
        for mode in ("global", "gap-split", "rolling"):
            out = summarize_by_bezeichnung(df, int(pid), mode=mode)
            sum_cases.append({
                "patientId": int(pid),
                "mode": mode,
                "rows": [
                    {"bezeichnung": str(r["Bezeichnung"]), "einheit": str(r["Einheit"]),
                     "nNumeric": int(r["n_numeric"]), "spanDays": int(r["span_days"]),
                     "slope": _num(r["slope"]), "reason": (r["reason"] if pd.notna(r["reason"]) else None)}
                    for _, r in out.iterrows()
                ],
            })
    return {"segments": seg_cases, "rolling": roll_cases, "summary": sum_cases}


def gen_ols() -> list[dict]:
    cases = [
        ([0.0, 1.0, 2.0, 3.0], [1.0, 3.0, 5.0, 7.0]),
        ([0.0, 1.0, 2.0, 3.0, 4.0], [1.0, 2.0, 1.3, 3.75, 2.25]),
        ([0.0, 0.5, 1.5, 2.0, 3.1], [2.1, 1.9, 1.2, 0.8, 0.3]),
        ([0.0, 1.0], [1.0, 2.0]),          # n<3
        ([2.0, 2.0, 2.0], [1.0, 2.0, 3.0]),  # identical x
    ]
    rows = []
    # _fit_ols_impl takes pandas datetime/value Series and converts to years;
    # to test the numeric kernel directly we feed synthetic dates spaced so that
    # (date - t0) in years equals the desired x. Use 365.25-day units.
    for xs, ys in cases:
        t0 = pd.Timestamp("2000-01-01")
        times = pd.Series([t0 + pd.Timedelta(days=x * 365.25) for x in xs])
        values = pd.Series(ys)
        fit = _fit_ols_impl(times, values)
        rows.append({
            "xYears": xs,
            "values": ys,
            "slope": _num(fit["slope"]),
            "intercept": _num(fit["intercept"]),
            "r2": _num(fit["r2"]),
            "ciLow": _num(fit["ci_low"]),
            "ciHigh": _num(fit["ci_high"]),
            "reason": fit["reason"],
        })
    return rows


def gen_egfr() -> dict:
    grid = [
        (1.0, 50, "m"), (1.0, 50, "w"), (1.0, 50, "d"),
        (0.6, 25, "w"), (2.5, 70, "m"), (1.2, 80, "w"),
        (1.0, 17, "m"), (0.0, 50, "m"), (1.0, 50, None),
    ]
    formula_cases = [
        {"scrMgdl": scr, "ageYears": age, "sex": sex,
         "ckdepi": _num(ckdepi_2021(scr_mgdl=scr, age_years=age, sex=sex)),
         "mdrd": _num(mdrd_4(scr_mgdl=scr, age_years=age, sex=sex))}
        for scr, age, sex in grid
    ]
    df = load_lab_excel(EGFR_DATA)
    appended = append_computed_egfr(df, formula="ckd-epi-2021")
    computed = appended[appended["Bezeichnung"].astype(str).str.contains(", computed)", regex=False)]
    egfr_rows = [
        {"patientId": int(r["PatientID"]), "date": _iso(r["LabDatum"]),
         "wertNum": _num(r["Wert_num"]), "operator": r["Wert_operator"]}
        for _, r in computed.iterrows()
    ]
    return {"formulas": formula_cases, "appended": egfr_rows}


def gen_aki() -> list[dict]:
    crafted = [
        [("2020-01-01", 1.0), ("2020-01-02", 1.5), ("2020-02-01", 1.0)],   # absolute rise
        [("2020-01-01", 1.0), ("2020-01-05", 1.6)],                        # relative rise
        [("2020-01-01", 3.5), ("2020-01-02", 4.1)],                        # stage 3 via peak>=4
        [("2020-01-01", 1.0), ("2020-02-01", 1.05), ("2020-03-01", 1.0)],  # stable -> none
    ]
    cases = []
    for pts in crafted:
        df = pd.DataFrame({"LabDatum": [pd.Timestamp(dt) for dt, _ in pts], "Wert_num": [v for _, v in pts]})
        eps = find_kdigo_aki_episodes(df)
        cases.append({
            "points": [{"date": pd.Timestamp(dt).isoformat() + "Z", "value": v} for dt, v in pts],
            "episodes": [{"date": pd.Timestamp(e["date"]).isoformat() + "Z", "stage": int(e["stage"]), "criterion": e["criterion"]} for e in eps],
        })
    return cases


def gen_aki_aware() -> list[dict]:
    """aki-aware-ckd preset fits: crafted cases + clustered-fixture creatinine."""
    crafted = [
        # calm series, no episode -> behaves like a global fit
        [("2019-01-01", 1.0), ("2020-01-01", 1.2), ("2021-01-01", 1.4), ("2022-01-01", 1.6)],
        # one AKI spike (abs +1.25 within 48 h); spike + recovery excluded
        [("2019-01-01", 1.0), ("2019-06-01", 1.1), ("2020-01-01", 1.05), ("2020-07-30", 1.15),
         ("2020-08-01", 2.4), ("2020-08-10", 1.8), ("2020-10-01", 1.2), ("2021-06-01", 1.3), ("2022-01-01", 1.4)],
        # everything after the baseline falls in the exclusion window -> unfittable
        [("2020-01-01", 1.0), ("2020-01-02", 1.6), ("2020-01-10", 1.4)],
    ]
    frames = [
        pd.DataFrame({"LabDatum": [pd.Timestamp(t) for t, _ in pts], "Wert_num": [v for _, v in pts]})
        for pts in crafted
    ]
    df = load_lab_excel(DATA)
    for pid in sorted(df["PatientID"].unique()):
        sub = df[(df["PatientID"] == pid)
                 & df["Bezeichnung"].astype(str).str.contains("reatinin")
                 & (df["Einheit"] == "mg/dl")]
        numeric = sub.dropna(subset=["Wert_num"]).sort_values("LabDatum").reset_index(drop=True)
        if len(numeric) >= 3:
            frames.append(numeric[["LabDatum", "Wert_num"]])
    cases = []
    for numeric in frames:
        fr = apply_preset(numeric, "aki-aware-ckd", exclusion_days=30)
        kept: list[int] = []
        for sf in fr.segments:
            if sf.meta.kept_indices is not None:
                kept.extend(int(i) for i in sf.meta.kept_indices)
            else:
                kept.extend(range(sf.meta.idx_range[0], sf.meta.idx_range[1]))
        cases.append({
            "points": [{"date": _iso(r.LabDatum), "value": float(r.Wert_num)} for r in numeric.itertuples()],
            "exclusionDays": 30,
            "keptIdx": sorted(kept),
            "slope": _num(fr.slope),
            "intercept": _num(fr.intercept),
            "r2": _num(fr.r2),
        })
    return cases


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "wert.json").write_text(json.dumps(gen_wert(), indent=2), encoding="utf-8")
    (OUT_DIR / "ols.json").write_text(json.dumps(gen_ols(), indent=2), encoding="utf-8")
    sr = gen_segments_rolling_summary()
    (OUT_DIR / "segments.json").write_text(json.dumps(sr["segments"], indent=2), encoding="utf-8")
    (OUT_DIR / "rolling.json").write_text(json.dumps(sr["rolling"], indent=2), encoding="utf-8")
    (OUT_DIR / "summary.json").write_text(json.dumps(sr["summary"], indent=2), encoding="utf-8")
    eg = gen_egfr()
    (OUT_DIR / "egfr.json").write_text(json.dumps(eg, indent=2), encoding="utf-8")
    (OUT_DIR / "aki.json").write_text(json.dumps(gen_aki(), indent=2), encoding="utf-8")
    (OUT_DIR / "aki_aware.json").write_text(json.dumps(gen_aki_aware(), indent=2), encoding="utf-8")
    print(f"Wrote goldens to {OUT_DIR}")


if __name__ == "__main__":
    main()
