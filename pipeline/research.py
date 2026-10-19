"""Season research report: plate discipline, results and batted-ball direction by pitch velocity,
plus pitch type, count, platoon, contact and in-game velocity studies.

Only counts and test results go out; the site turns them into rates (with their samples) and
Korean sentences. The output is part of the encrypted data, never the public sample.
"""

import math

import numpy as np
import pandas as pd
from scipy import stats

from build_stats import batting_line

# km/h. Chosen for sbo-2026, where pitches run roughly 90-140.
VELO_BANDS = [("lt110", None, 110), ("110", 110, 120), ("120", 120, 125), ("125", 125, 130), ("130", 130, None)]
# Spray angle (degrees from straightaway center) beyond which a ball counts as pulled or opposite field.
# Fair territory spans +-45, so this splits it into three equal 30-degree sectors.
PULL_ANGLE = 15
PLATE = (0.5, 0.92)  # lib/field.ts
HITS = {"1B": 1, "2B": 2, "3B": 3, "HR": 4}
FASTBALLS = {"FF", "FT", "SI", "FC", "RF", "DF"}  # site/src/lib/charts.ts
# Fewer rows than this: no regression (it would not mean anything and may not converge).
MIN_FIT = 20


def band_of(velo: pd.Series) -> pd.Series:
    out = pd.Series(None, index=velo.index, dtype=object)
    for key, lo, hi in VELO_BANDS:
        out[(velo >= (lo if lo is not None else -np.inf)) & (velo < (hi if hi is not None else np.inf))] = key
    return out


def logit(x: np.ndarray, y: np.ndarray) -> dict | None:
    """Logistic regression y ~ x. Returns the odds ratio for +1 x with a 95% interval and p (Wald)."""
    x, y = np.asarray(x, float), np.asarray(y, float)
    if len(y) < MIN_FIT or y.min() == y.max() or np.ptp(x) == 0:
        return None
    X = np.column_stack([np.ones_like(x), x])
    b = np.zeros(2)
    for _ in range(100):
        p = 1 / (1 + np.exp(-X @ b))
        H = X.T @ (X * (p * (1 - p))[:, None])
        step = np.linalg.solve(H + 1e-9 * np.eye(2), X.T @ (y - p))
        b += step
        if np.abs(step).max() < 1e-10:
            break
    se = math.sqrt(np.linalg.inv(H)[1, 1])
    if not np.isfinite(b[1]) or not np.isfinite(se) or abs(b[1]) > 20:
        return None  # separated data: no finite estimate
    z = b[1] / se
    return {"or": math.exp(b[1]), "lo": math.exp(b[1] - 1.96 * se), "hi": math.exp(b[1] + 1.96 * se), "p": math.erfc(abs(z) / math.sqrt(2)), "n": len(y)}


def ols_slope(x: np.ndarray, y: np.ndarray) -> dict | None:
    x, y = np.asarray(x, float), np.asarray(y, float)
    if len(y) < MIN_FIT or np.ptp(x) == 0:
        return None
    xc = x - x.mean()
    slope = (xc * (y - y.mean())).sum() / (xc ** 2).sum()
    resid = y - y.mean() - slope * xc
    se = math.sqrt((resid ** 2).sum() / (len(y) - 2) / (xc ** 2).sum())
    p = 2 * stats.t.sf(abs(slope / se), len(y) - 2) if se > 0 else 0.0
    return {"slope": slope, "lo": slope - 1.96 * se, "hi": slope + 1.96 * se, "p": p, "n": len(y)}


def trend(rows: pd.DataFrame, outcome: pd.Series, own_mean: pd.Series) -> dict | None:
    """Odds ratio per +5 km/h, overall and against each pitcher's own average, and how much one pitcher matters."""
    x = (rows.velo - 120) / 5
    overall = logit(x, outcome)
    if overall is None:
        return None
    within = logit((rows.velo - own_mean) / 5, outcome)
    # The pitcher whose removal weakens the trend most (largest p without them).
    weakest = None
    for pid in rows.pitcher_id.unique():
        keep = rows.pitcher_id != pid
        fit = logit(x[keep], outcome[keep])
        if fit and (weakest is None or fit["p"] > weakest["p"]):
            weakest = {"pitcher_id": pid, "p": fit["p"], "or": fit["or"], "n": fit["n"]}
    return overall | {"within": within, "without_one": weakest}


def discipline_counts(p: pd.DataFrame) -> dict:
    z, o = p[p.in_zone], p[p.out_zone]
    return {
        "pitches": len(p), "swings": int(p.swing.sum()), "whiffs": int(p.whiff.sum()),
        "called": int((p.result == "called_strike").sum()),
        "fouls": int(p.result.isin(["foul", "foul_tip"]).sum()), "in_play": int((p.result == "in_play").sum()),
        "located": len(z) + len(o), "zone_pitches": len(z),
        "zone_swings": int(z.swing.sum()), "zone_whiffs": int(z.whiff.sum()),
        "chase_pitches": len(o), "chase_swings": int(o.swing.sum()), "chase_whiffs": int(o.whiff.sum()),
    }


def result_line(pas: pd.DataFrame) -> dict:
    b = batting_line(pas, pas.iloc[0:0])
    return {k: b[k] for k in ("pa", "ab", "h", "hr", "bb", "hbp", "k", "tb", "avg", "obp", "slg", "ops")}


def spray(bip: pd.DataFrame) -> pd.Series:
    """'pull', 'center' or 'oppo' for balls in play with a landing spot and a known batter side."""
    angle = np.degrees(np.arctan2(bip.field_x - PLATE[0], PLATE[1] - bip.field_y))  # <0 left field
    toward = np.where(bip.b_side == "R", -angle, angle)  # >0 = toward the batter's pull side
    out = pd.Series(np.where(toward > PULL_ANGLE, "pull", np.where(toward < -PULL_ANGLE, "oppo", "center")), index=bip.index)
    return out.where(bip.field_x.notna() & bip.field_y.notna() & bip.b_side.isin(["L", "R"]))


def direction_counts(bip: pd.DataFrame) -> dict:
    d = spray(bip)
    hits = bip.pa_result.isin(HITS)
    return {
        "bip": len(bip), "located": int(d.notna().sum()),
        **{k: int((d == k).sum()) for k in ("pull", "center", "oppo")},
        **{f"{k}_hits": int(((d == k) & hits).sum()) for k in ("pull", "center", "oppo")},
        **{k: int((bip.bb_type == k).sum()) for k in ("ground", "line", "fly", "popup", "bunt")},
        "typed": int(bip.bb_type.notna().sum()), "hits": int(hits.sum()),
        "hard": int((bip.contact_quality == "hard").sum()), "rated": int(bip.contact_quality.notna().sum()),
    }


def season_report(df: pd.DataFrame, season: str, names: dict[str, str]) -> dict | None:
    rows = df[(df.season == season) & df.detailed]
    pitches = rows[rows.result.notna()].copy()
    if pitches.empty:
        return None
    own = pitches.groupby("pitcher_id").velo.mean()
    pitches["own_velo"] = pitches.pitcher_id.map(own)
    pitches["band"] = band_of(pitches.velo)
    v = pitches[pitches.velo.notna()]
    pas = rows[rows.pa_result.notna()].copy()
    pas["band"] = band_of(pas.velo)
    pas["own_velo"] = pas.pitcher_id.map(own)
    bip = v[v.result == "in_play"]

    # Pitchers split into thirds by their average velocity (for results by pitcher speed).
    ranked = own.dropna().sort_values()
    thirds = np.array_split(ranked.index.to_numpy(), 3) if len(ranked) >= 3 else [ranked.index.to_numpy()]
    by_pitcher_speed = []
    for i, ids in enumerate(thirds):
        sub = pas[pas.pitcher_id.isin(ids)]
        if len(ids) and len(sub):
            by_pitcher_speed.append({"group": i, "pitchers": len(ids), "lo": float(ranked[ids].min()), "hi": float(ranked[ids].max())} | result_line(sub))

    def fit(sub: pd.DataFrame, y: pd.Series) -> dict | None:
        return trend(sub, y.astype(float), sub.own_velo)

    located = v[v.in_zone | v.out_zone]
    out_zone = v[v.out_zone]
    swings = v[v.swing]
    pa_v = pas[pas.velo.notna()]
    sided = bip[spray(bip).notna()]
    trends = {
        "swing": fit(v, v.swing),
        "whiff": fit(swings, swings.whiff),
        "chase": fit(out_zone, out_zone.swing),
        "zone_swing": fit(v[v.in_zone], v[v.in_zone].swing),
        "zone": fit(located, located.in_zone),
        "csw": fit(v, v.whiff | (v.result == "called_strike")),
        "on_base": fit(pa_v, pa_v.pa_result.isin([*HITS, "BB", "HBP"])),
        "pull": fit(sided, spray(sided) == "pull"),
        "ground": fit(bip[bip.bb_type.notna()], bip[bip.bb_type.notna()].bb_type == "ground"),
    }

    # In-game velocity: fastball velocity relative to the pitcher's fastball average in that game, against the
    # pitch number in the outing (all pitches counted). Fastballs only, so a changing pitch mix cannot explain it.
    outing = pitches.groupby(["game_id", "pitcher_id"])
    number = outing.cumcount()  # every pitch counts, with or without a velocity reading
    fb = v[v.pitch_type.isin(FASTBALLS)]
    fb_rel = fb.velo - fb.groupby(["game_id", "pitcher_id"]).velo.transform("mean")
    fatigue = ols_slope(number[fb.index].to_numpy() / 10, fb_rel.to_numpy())
    fatigue_by_number = [
        {"from": lo + 1, "to": hi, "n": int(m.sum()), "velo_avg": float(fb.velo[m].mean()), "velo_rel": float(fb_rel[m].mean())}
        for lo, hi in [(0, 5), (5, 10), (10, 15), (15, None)]
        if (m := (number[fb.index] >= lo) & (number[fb.index] < (hi if hi is not None else np.inf))).any()
    ]

    counts = [
        {"key": k} | discipline_counts(pitches[m])
        for k, m in [
            ("first_pitch", pitches.first_pitch), ("count_ahead", pitches.balls > pitches.strikes),
            ("count_even", pitches.balls == pitches.strikes), ("count_behind", pitches.strikes > pitches.balls),
            ("two_strikes", pitches.strikes == 2),
        ]
    ]
    same = lambda d: d.p_hand.isin(["L", "R"]) & d.b_side.isin(["L", "R"]) & (d.p_hand == d.b_side)
    opp = lambda d: d.p_hand.isin(["L", "R"]) & d.b_side.isin(["L", "R"]) & (d.p_hand != d.b_side)
    platoon = [
        {"key": k} | result_line(pas[m(pas)]) | discipline_counts(pitches[m(pitches)])
        for k, m in [("same", same), ("opposite", opp)]
        if m(pas).any()
    ]
    all_bip = pitches[pitches.result == "in_play"]
    contact = [
        {"key": k, "bip": int(m.sum()), "hits": int((m & all_bip.pa_result.isin(HITS)).sum()), "tb": int(all_bip[m].pa_result.map(HITS).fillna(0).sum())}
        for k, m in [(q, all_bip.contact_quality == q) for q in ("hard", "medium", "weak")]
        + [(t, all_bip.bb_type == t) for t in ("ground", "line", "fly", "popup")]
        if m.any()
    ]
    pitch_types = []
    for code, g in pitches[pitches.pitch_type.notna()].groupby("pitch_type"):
        gb = g[g.result == "in_play"]
        pitch_types.append(
            {"code": code, "fastball": code in FASTBALLS, "velo_n": int(g.velo.notna().sum()),
             "velo_avg": float(g.velo.mean()) if g.velo.notna().any() else None, "pitchers": int(g.pitcher_id.nunique())}
            | discipline_counts(g) | {"bip": len(gb), "hits": int(gb.pa_result.isin(HITS).sum())}
        )
    pitch_types.sort(key=lambda t: -t["pitches"])

    used = set(pitches.pitcher_id) | {t["without_one"]["pitcher_id"] for t in trends.values() if t and t["without_one"]}
    return {
        "season": season,
        "sample": {
            "games": int(rows.game_id.nunique()), "pitches": len(pitches), "velo_pitches": len(v),
            "pa": len(pas), "bip": int((pitches.result == "in_play").sum()),
            "pitchers": int(pitches.pitcher_id.nunique()), "batters": int(pitches.batter_id.nunique()),
            "velo_min": float(v.velo.min()) if len(v) else None, "velo_max": float(v.velo.max()) if len(v) else None,
            "velo_median": float(v.velo.median()) if len(v) else None,
        },
        "bands": [k for k, _, _ in VELO_BANDS],
        "discipline": [
            {"band": k, "velo_avg": float(g.velo.mean()), "pitchers": int(g.pitcher_id.nunique())} | discipline_counts(g)
            for k, _, _ in VELO_BANDS if len(g := v[v.band == k])
        ],
        "discipline_all": {"velo_avg": float(v.velo.mean()) if len(v) else None, "pitchers": int(v.pitcher_id.nunique())} | discipline_counts(v),
        "discipline_fastballs": [
            {"band": k} | discipline_counts(g)
            for k, _, _ in VELO_BANDS if len(g := v[(v.band == k) & v.pitch_type.isin(FASTBALLS)])
        ],
        "results": [{"band": k} | result_line(g) for k, _, _ in VELO_BANDS if len(g := pas[pas.band == k])],
        "results_all": result_line(pas[pas.band.notna()]),
        "results_by_pitcher_speed": by_pitcher_speed,
        "direction": [{"band": k} | direction_counts(g) for k, _, _ in VELO_BANDS if len(g := bip[bip.band == k])],
        "direction_all": direction_counts(bip),
        "trends": trends,
        "fatigue": fatigue | {"outings": int(outing.ngroups), "by_number": fatigue_by_number} if fatigue else None,
        "counts": counts,
        "platoon": platoon,
        "contact": contact,
        "pitch_types": pitch_types,
        "pitchers": sorted(
            ({"id": pid, "name": names.get(pid, pid), "pitches": int((pitches.pitcher_id == pid).sum()),
              "velo_avg": None if pd.isna(own.get(pid)) else float(own[pid])} for pid in used),
            key=lambda p: -(p["velo_avg"] or 0),
        ),
    }
