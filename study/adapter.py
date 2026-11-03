import hashlib
import json
import threading
from pathlib import Path

from engine_v2.engine_v2_1 import SennaEngineBridge

from .config import ROOT
from .schemas import FAMILIES, SCENARIOS


class EngineAdapter:
    def __init__(self):
        self.engine = SennaEngineBridge()
        self.lock = threading.Lock()
        self.catalog_hash = hashlib.sha256((ROOT / "engine_v2/catalog_v2.json").read_bytes()).hexdigest()
        image_file = ROOT / "static/study/images.json"
        self.images = json.loads(image_file.read_text(encoding="utf-8")) if image_file.is_file() else {}

    def recommend(self, pre, preference):
        favorite = preference.get("favorite_id")
        if favorite is not None and favorite not in self.engine.by_id:
            raise ValueError("ไม่พบน้ำหอมที่เลือกในฐานข้อมูล")
        budget = {"ต่ำกว่า 1,500 บาท": 0, "1,500–4,000 บาท": 1}.get(pre["q21_budget"])
        with self.lock:
            result = self.engine.recommend(
                SCENARIOS[pre["scenario"]],
                families=[FAMILIES[x] for x in preference["families"]] or None,
                sillage=preference["sillage"], budget=budget,
                image=preference["image"], styles=preference["styles"], favorite_id=favorite,
            )
        cards = {}
        for method in ("A", "B"):
            for index, raw in enumerate(result[method]):
                item = self.engine.items[self.engine.by_id[raw["id"]]]
                reasons = []
                for text in raw["reasons"]:
                    if text == "หาซื้อได้ที่ Central":
                        text = "หลักฐานการวางขาย: " + item["thai_status"]
                    elif text.startswith("อยู่ในงบ"):
                        text = "ระดับราคาที่บันทึกไม่เกินช่วงงบที่เลือก (ตรวจหลักฐานราคาประกอบ)"
                    elif text.startswith("กลิ่นระดับปานกลาง:"):
                        text = "ระดับกลิ่นที่บันทึกเป็นปานกลาง ต่างจากระดับเบาที่เลือก"
                    elif text.startswith("มีส่วนผสมของทั้ง"):
                        text = text.replace("มีส่วนผสมของทั้ง", "มีลักษณะกลิ่นของทั้ง", 1)
                    reasons.append(text)
                if not reasons:
                    reasons = ["เป็นหนึ่งในตัวเลือกจากการจัดอันดับข้อมูลกลิ่นที่มีในฐานข้อมูล"]
                cards[f"{method}{index}"] = {
                    "id": raw["id"], "brand": raw["brand"], "name": raw["name"],
                    "family": raw["family"], "sillage": raw["sillage"],
                    "sillage_estimated": item["sillage_source"] != "vote",
                    "price": raw["price"], "price_evidence": raw["price_evidence"],
                    "availability": item["thai_status"], "url": item["url"],
                    "image_url": self.images.get(item["url"], ""),
                    "over_budget": budget is not None and item["price_tier"] is not None and item["price_tier"] > budget,
                    "reasons": reasons,
                }
        return result, cards

    def search(self, text):
        if len(text.strip()) < 2:
            return []
        return self.engine.search(text.strip(), 10)
