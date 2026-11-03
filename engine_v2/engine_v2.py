# engine_v2.py — ScentSelf / Senna recommendation engine (runtime: numpy only)
# Method A (main): family match + sillage match - budget penalty + availability bonus
# Method B (alternative / blind comparison): same, but family match in NMF latent space
# Reasons come from the Fragrance Relationship Graph rules (only statistically supported consumer edges).
import json, os
from typing import List, Optional, Dict, Any
import numpy as np

_HERE = os.path.dirname(os.path.abspath(__file__))
SILLAGE_TH = ["กลิ่นเบา", "กลิ่นปานกลาง", "กลิ่นชัด"]
TIER_TH = ["ต่ำกว่า 1,500 บาท", "1,500–4,000 บาท", "มากกว่า 4,000 บาท"]


class SennaEngine:
    def __init__(self, catalog_path: str = os.path.join(_HERE, "catalog_v2.json")):
        data = json.load(open(catalog_path, encoding="utf-8"))
        self.meta, self.items = data["meta"], data["items"]
        self.fams = self.meta["families"]; p = self.meta["params"]
        self.W_SIL, self.PEN, self.AVB, self.POP = p["W_SIL"], p["BUDGET_PENALTY"], p["AVAIL_BONUS"], p["POPULAR_SHARE"]
        self.F = np.array([it["family_vec"] for it in self.items])
        self.L = np.array([it["latent"] for it in self.items])
        self.S = np.array([it["sim_vec"] for it in self.items])
        self.sil = np.array([it["sillage"] for it in self.items])
        self.tier = np.array([np.nan if it["price_tier"] is None else it["price_tier"] for it in self.items], dtype=float)
        self.central = np.array([1.0 if it["central"] else 0.0 for it in self.items])
        self.proto = {f: np.array(v) for f, v in self.meta["nmf_prototypes"].items()}
        self.edges = {(e["kind"], e["group"], e["family"]): e for e in self.meta["consumer_edges"]}
        self.by_id = {it["id"]: k for k, it in enumerate(self.items)}

    @staticmethod
    def _mm(x):
        lo, hi = float(np.min(x)), float(np.max(x)); return (x - lo) / (hi - lo) if hi > lo else np.zeros_like(x)

    def popular_families(self, scenario: str, k: int = 3) -> List[str]:
        sh = self.meta["scenario_family_share"].get(scenario, {})
        return [f for f, _ in sorted(sh.items(), key=lambda t: -t[1])[:k]]

    def _score(self, method: str, families: List[str], sillage: Optional[int], budget: Optional[int], favorite_id: Optional[int]):
        if method == "A":
            fam = self._mm(np.max([self.F[:, self.fams.index(f)] for f in families], axis=0))
        else:
            fam = self._mm(np.max([self.L @ self.proto[f] for f in families], axis=0))
        if favorite_id is not None and favorite_id in self.by_id:                 # similar-scent: blend in similarity to the liked perfume
            fam = 0.5 * fam + 0.5 * self._mm(self.S @ self.S[self.by_id[favorite_id]])
        s = fam.copy()
        if sillage is not None: s += self.W_SIL * (self.sil == sillage)
        if budget is not None: s -= self.PEN * np.clip(np.nan_to_num(self.tier - budget, nan=0.0), 0, None)
        s += self.AVB * self.central
        if favorite_id is not None and favorite_id in self.by_id: s[self.by_id[favorite_id]] = -np.inf
        return s

    def _reasons(self, it, families, sillage, budget, scenario, image, styles, favorite_id) -> List[str]:
        r = []
        if it["family"] in families: r.append(f"แนวกลิ่นตรงที่ขอ ({it['family']})")
        if sillage is not None and it["sillage"] == sillage: r.append(f"ระดับการกระจายกลิ่นตรง ({SILLAGE_TH[sillage]})"
                                                                    + (" · ค่าประมาณจากโมเดล" if it["sillage_source"] != "vote" else ""))
        elif sillage == 0 and it["sillage"] == 1: r.append("กลิ่นระดับปานกลาง: ฉีดน้อยลงหรือฉีดจุดที่ไม่ใกล้หน้าเพื่อให้กลิ่นเบาลง")
        if budget is not None and it["price_tier"] is not None and it["price_tier"] <= budget: r.append(f"อยู่ในงบ ({TIER_TH[it['price_tier']]})")
        if image and ("image", image, it["family"]) in self.edges: r.append(f"แนวกลิ่นนี้มักถูกเลือกเพื่อสื่อภาพลักษณ์ '{image}'")
        for st in styles or []:
            if ("styles", st, it["family"]) in self.edges: r.append(f"แนวกลิ่นนี้มักถูกเลือกโดยคนสไตล์ {st}"); break
        share = self.meta["scenario_family_share"].get(scenario, {}).get(it["family"], 0)
        if share >= self.POP: r.append(f"เป็นแนวที่นิยมในสถานการณ์นี้ ({share:.0%} ของผู้ตอบ)")
        if favorite_id is not None and favorite_id in self.by_id:
            shared = sorted(set(it["notes"]) & set(self.items[self.by_id[favorite_id]]["notes"]))[:4]
            if shared: r.append("มี note เหมือนน้ำหอมที่คุณชอบ: " + ", ".join(shared))
        if it["central"]: r.append("หาซื้อได้ที่ Central")
        return r

    def recommend(self, scenario: str, families: Optional[List[str]] = None, sillage: Optional[int] = None,
                  budget: Optional[int] = None, image: Optional[str] = None, styles: Optional[List[str]] = None,
                  favorite_id: Optional[int] = None, k: int = 3) -> Dict[str, Any]:
        """scenario: 'A งาน/เรียน' | 'B พักผ่อน' | 'C งานเลี้ยงเย็น'; families: up to 2 of meta['families'] or None (= not sure);
        sillage: 0/1/2 or None; budget: 0 (<1,500) / 1 (1,500–4,000) / None (> 4,000 or undecided -> no penalty)."""
        fallback = not families
        fams = families if families else self.popular_families(scenario, 2)
        out = {"request": dict(scenario=scenario, families=fams, families_from_popularity=fallback, sillage=sillage, budget=budget,
                               image=image, styles=styles, favorite_id=favorite_id)}
        for m in ("A", "B"):
            s = self._score(m, fams, sillage, budget, favorite_id)
            top = np.argsort(-s)[:k]
            out[m] = [dict(id=self.items[i]["id"], brand=self.items[i]["brand"], name=self.items[i]["name"], family=self.items[i]["family"],
                           sillage=SILLAGE_TH[self.items[i]["sillage"]], price="ยังไม่ทราบระดับราคา" if self.items[i]["price_tier"] is None else TIER_TH[self.items[i]["price_tier"]],
                           price_ref=self.items[i]["price_ref"], price_evidence=self.items[i]["price_evidence"], thai_status=self.items[i]["thai_status"],
                           score=round(float(s[i]), 4),
                           reasons=self._reasons(self.items[i], fams, sillage, budget, scenario, image, styles, favorite_id)) for i in top]
        return out

    def search(self, text: str, limit: int = 10):
        t = text.lower().strip()
        return [dict(id=it["id"], brand=it["brand"], name=it["name"]) for it in self.items if t in f"{it['brand']} {it['name']}".lower()][:limit]
