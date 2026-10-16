import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from export_json import build_outputs, sample_files  # noqa: E402
from fixture import SEASON  # noqa: E402
from research import band_of, logit, spray  # noqa: E402
from test_pipeline import load_fixture  # noqa: E402


class ResearchTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = build_outputs(load_fixture(), report_seasons=[SEASON])

    def test_spray_direction_depends_on_batter_side(self):
        # Left field, center, right field; plate at (0.5, 0.92).
        bip = pd.DataFrame({
            "field_x": [0.2, 0.2, 0.5, 0.8, 0.8, 0.2, None],
            "field_y": [0.6, 0.6, 0.4, 0.6, 0.6, 0.6, 0.5],
            "b_side": ["R", "L", "R", "R", "L", None, "R"],
        })
        self.assertEqual(spray(bip).tolist()[:5], ["pull", "oppo", "center", "oppo", "pull"])
        self.assertTrue(spray(bip)[5:].isna().all())  # unknown side or no landing spot

    def test_velo_bands(self):
        bands = band_of(pd.Series([109.9, 110, 124, 125, 140, None]))
        self.assertEqual(bands[:5].tolist(), ["lt110", "110", "120", "125", "130"])
        self.assertTrue(pd.isna(bands[5]))

    def test_logit_finds_a_trend_and_refuses_degenerate_data(self):
        x = np.linspace(-3, 3, 200)
        y = (np.sin(np.arange(200) * 7.1) < x / 3).astype(float)  # more 1s as x grows, deterministic
        fit = logit(x, y)
        self.assertGreater(fit["or"], 1)
        self.assertLess(fit["p"], 0.001)
        self.assertIsNone(logit(x, np.ones(200)))
        self.assertIsNone(logit(x[:5], y[:5]))

    def test_report_counts_match_the_fixture(self):
        r = self.out[f"report/{SEASON}.json"]
        self.assertEqual((r["sample"]["games"], r["sample"]["pitches"], r["sample"]["pa"]), (1, 14, 7))
        self.assertEqual(sum(d["pitches"] for d in r["discipline"]), r["sample"]["velo_pitches"])
        self.assertEqual(r["discipline_all"]["pitches"], r["sample"]["velo_pitches"])
        self.assertEqual(sum(x["pa"] for x in r["results"]), r["results_all"]["pa"])
        self.assertEqual(self.out["meta.json"]["reports"], [SEASON])

    def test_report_is_password_only(self):
        self.assertNotIn(f"report/{SEASON}.json", build_outputs(load_fixture()))  # season not listed: no report
        self.assertFalse(any(k.startswith("report/") for k in sample_files(self.out, ["v-a"])))


if __name__ == "__main__":
    unittest.main()
