# engine_v2_1.py — adds bridge notes to engine_v2 (engine_v2.py is unchanged and still required).
# Only 2-family requests change: + BLEND x (share in the weaker of the two families) + BRIDGE x (bridge notes of that pair, max 2)
# Single-family and "not sure" requests (families=None) give exactly the same result as engine_v2.
import json, os
import numpy as np
try:
    from .engine_v2 import SennaEngine, _HERE
except ImportError:
    from engine_v2 import SennaEngine, _HERE

class SennaEngineBridge(SennaEngine):
    BLEND, BRIDGE = 0.25, 0.15

    def __init__(self, catalog_path=os.path.join(_HERE, "catalog_v2.json"), bridge_path=os.path.join(_HERE, "bridge_notes.json")):
        super().__init__(catalog_path)
        self.P = self.F / self.F.sum(1, keepdims=True)
        self.pair_notes = {}
        for r in json.load(open(bridge_path, encoding="utf-8"))["pairs"]:
            self.pair_notes.setdefault(frozenset((r["fam_a"], r["fam_b"])), []).append(r["note"])   # strongest first
        self._notes = [set(it["notes"]) for it in self.items]; self._user_pair = False

    def _bridge_found(self, idx, families):
        return [n for n in self.pair_notes.get(frozenset(families), []) if n in self._notes[idx]]

    def _score(self, method, families, sillage, budget, favorite_id):
        s = super()._score(method, families, sillage, budget, favorite_id)
        if self._user_pair and len(families) == 2:
            a, b = (self.fams.index(f) for f in families)
            s = s + self.BLEND * self._mm(np.minimum(self.P[:, a], self.P[:, b]))
            s = s + self.BRIDGE * np.array([min(len(self._bridge_found(i, families)), 2) / 2 for i in range(len(self.items))])
        return s

    def recommend(self, scenario, families=None, **kw):
        self._user_pair = bool(families) and len(families) == 2      # only when the user chose 2 families themselves
        out = super().recommend(scenario, families, **kw)
        fams = out["request"]["families"]; out["request"]["bridge_applied"] = self._user_pair
        if self._user_pair:
            a, b = (self.fams.index(f) for f in fams)
            for m in ("A", "B"):
                for r in out[m]:
                    i = self.by_id[r["id"]]; extra = []
                    if min(self.P[i, a], self.P[i, b]) >= 0.15: extra.append(f"มีส่วนผสมของทั้ง {fams[0]} และ {fams[1]} ในขวดเดียว")
                    bn = self._bridge_found(i, fams)
                    if bn: extra.append(f"มี {', '.join(bn[:2])} ซึ่งเป็น note ที่เชื่อม {fams[0]} กับ {fams[1]}")
                    r["reasons"] = r["reasons"][:1] + extra + r["reasons"][1:]
        return out
