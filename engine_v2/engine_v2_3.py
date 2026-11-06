# engine_v2_3.py (6 Nov 2026) — engine v2.2 + optional scent-gender preference. engine_v2 / v2_1 / v2_2 are unchanged.
# The participant may say the bottle should be "women", "men" or "any" (or skip). Items marketed for the OTHER gender get
# GENDER_PENALTY (1.0 = larger than any family/sillage/budget difference, so they appear only when nothing else is left).
# Unisex items and items with no stated gender (Thai brands) are never penalised. "any"/None = exactly v2.2.
# Same rule for Method A and B, so the blind comparison stays fair. Owned-bottle tools never set it.
try:
    from .engine_v2_2 import SennaEngineV22
except ImportError:
    from engine_v2_2 import SennaEngineV22
import numpy as np

ENGINE_VERSION = "v2.3"
OPPOSITE = {"women": "male", "men": "female"}
GENDER_TH = {"female": "แนวผู้หญิง", "male": "แนวผู้ชาย", "unisex": "ยูนิเซ็กซ์", None: "ไม่ระบุเพศ"}


class SennaEngineV23(SennaEngineV22):
    GENDER_PENALTY = 1.0

    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        self.gender = np.array([it.get("gender") or "" for it in self.items], dtype=object)
        self.gender_pref = None                         # set per request by the adapter (under its lock)

    def _score(self, method, families, sillage, budget, favorite_id):
        s = super()._score(method, families, sillage, budget, favorite_id)
        other = OPPOSITE.get(self.gender_pref)
        if other:
            s = s - self.GENDER_PENALTY * (self.gender == other)
        return s

    def recommend(self, scenario, families=None, **kw):
        out = super().recommend(scenario, families, **kw)
        out["request"]["scent_gender"] = self.gender_pref
        return out
