# study_v3_adapter.py: EngineAdapter for the Senna v3 app (main_v3.py passes it to make_router()).
# 3 Nov 2026: catalog_v3.2 (487 items, Thai notes corrected) + engine v2.2 (no sillage bonus for estimates,
# unknown-price penalty under a budget). History: 1 Nov 2026 catalog_v3 + engine v2.1.
# 6 Nov 2026: catalog_v3.3 (+ marketed gender per item) + engine v2.3 (optional scent-gender preference); cards carry "gender".
import hashlib
import json
import threading

from engine_v2.engine_v2_3 import ENGINE_VERSION, GENDER_TH, SennaEngineV23
from study.adapter import EngineAdapter
from study.config import ROOT

CATALOG_V3 = ROOT / "engine_v2" / "catalog_v3_3.json"
IMAGES_V3 = ROOT / "static" / "study_v3" / "images_v3.json"


class EngineAdapterV3(EngineAdapter):
    def __init__(self):
        self.engine = SennaEngineV23(catalog_path=str(CATALOG_V3))
        self.engine_version = ENGINE_VERSION
        self.lock = threading.RLock()   # re-entrant: recommend() below holds it around the base recommend()
        self.catalog_hash = hashlib.sha256(CATALOG_V3.read_bytes()).hexdigest()
        self.images = json.loads(IMAGES_V3.read_text(encoding="utf-8")) if IMAGES_V3.is_file() else {}
        self.catalog_version = self.engine.meta.get("version", "catalog_v3") if hasattr(self.engine, "meta") else "catalog_v3"

    def recommend(self, pre, preference):
        with self.lock:
            self.engine.gender_pref = preference.get("scent_gender")
            try:
                result, cards = super().recommend(pre, preference)
            finally:
                self.engine.gender_pref = None
        for card in cards.values():
            g = self.engine.items[self.engine.by_id[card["id"]]].get("gender")
            card["gender"] = GENDER_TH[g]
        return result, cards

    # Accent- and order-insensitive search (catalog_v3 adds names such as "Acqua di Giò", "Bibliothèque", "Chloé"):
    # every query word must start a word of "brand + name" (or, if 4+ letters, appear inside it); plain substring matches are ranked first.
    @staticmethod
    def _fold(text):
        import re
        import unicodedata
        text = unicodedata.normalize("NFKD", str(text)).encode("ascii", "ignore").decode().lower()
        return re.sub(r"[^a-z0-9ก-๙]+", " ", text.replace("&", " and ")).strip()

    def search(self, text):
        q = self._fold(text)
        if len(q) < 2:
            return []
        words = q.split()
        hits = []
        for it in self.engine.items:
            hay = self._fold(f"{it['brand']} {it['name']}")
            hw = hay.split()
            if all(any(h.startswith(w) for h in hw) or (len(w) >= 4 and w in hay) for w in words):
                hits.append((0 if q in hay else 1, len(hay), dict(id=it["id"], brand=it["brand"], name=it["name"])))
        return [h[2] for h in sorted(hits, key=lambda h: (h[0], h[1]))][:10]
