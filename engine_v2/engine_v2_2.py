# engine_v2_2.py (3 Nov 2026) — engine v2.1 (bridge notes) + data-uncertainty rules. engine_v2.py and engine_v2_1.py are unchanged.
#  1) Sillage bonus: items with community-vote sillage keep the full W_SIL bonus; items whose sillage is a notes-model estimate
#     (catalog_v3.2: 3 Fragrantica items with tied votes + 15 Thai-brand items) get EST_SILLAGE_SHARE x W_SIL, i.e. the expected bonus given
#     that the estimate is right about half the time (5-fold CV accuracy of the sillage model = 53%, n = 1,648 voted perfumes).
#     The card says the level is an estimate instead of claiming a match.
#  2) Unknown price under a budget: no score change (tested: any penalty mainly swapped unknown-price items for items known to be
#     over budget), but the card says the price is unknown and never says "within budget".
# Everything else (Method A/B scores, budget penalty, Central bonus, popularity fallback, bridge notes, favorite similarity) = v2.1.
import numpy as np
try:
    from .engine_v2_1 import SennaEngineBridge
except ImportError:
    from engine_v2_1 import SennaEngineBridge

ENGINE_VERSION = "v2.2"


class SennaEngineV22(SennaEngineBridge):
    EST_SILLAGE_SHARE = 0.5
    UNKNOWN_PRICE_PENALTY = 0.0

    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        self.sil_voted = np.array([1.0 if it["sillage_source"] == "vote" else 0.0 for it in self.items])
        self.price_unknown = np.isnan(self.tier).astype(float)

    def _score(self, method, families, sillage, budget, favorite_id):
        s = super()._score(method, families, sillage, budget, favorite_id)
        if sillage is not None:                       # v2.1 gave estimated sillage the full bonus; keep only the expected share
            s = s - self.W_SIL * (1.0 - self.EST_SILLAGE_SHARE) * (self.sil == sillage) * (1.0 - self.sil_voted)
        if budget is not None and self.UNKNOWN_PRICE_PENALTY:
            s = s - self.UNKNOWN_PRICE_PENALTY * self.price_unknown
        return s

    def _reasons(self, it, families, sillage, budget, scenario, image, styles, favorite_id):
        r = super()._reasons(it, families, sillage, budget, scenario, image, styles, favorite_id)
        if sillage is not None and it["sillage_source"] != "vote" and it["sillage"] == sillage:
            r = [x for x in r if not x.startswith("ระดับการกระจายกลิ่นตรง")]
            r.insert(1 if r else 0, "ระดับการกระจายกลิ่นน่าจะใกล้ที่ขอ แต่เป็นค่าประมาณจากโน้ต (ยังไม่มีโหวตผู้ใช้)")
        if budget is not None and it["price_tier"] is None:
            r.append("ยังไม่ทราบระดับราคา ควรเช็กราคาก่อนซื้อ")
        return r
