"""Independent, stateless Senna product preview. No study or admin routes."""
import re
import os
from pathlib import Path
from typing import Annotated, Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from pydantic import AfterValidator, Field, model_validator

from engine_v2.engine_v2 import SILLAGE_TH, TIER_TH
from engine_v2.engine_v2_3 import GENDER_TH, OPPOSITE
from engine_v2.family_eligibility import select_family_candidates
from study.owned_index import OwnedIndex
from study.schemas import FAMILIES, SCENARIOS, STYLES, Payload
from study.scent_description import compare_scents, scent_description
from study.wardrobe import OwnedComparison, assess_private
from study_v3_adapter import EngineAdapterV3
from advisor_commerce import shopping_links

ROOT = Path(__file__).resolve().parent
EVENTS = {
    "concert": ("คอนเสิร์ต", "B", ("woody", "citrus", "musk"), 1),
    "wedding_morning": ("งานแต่งช่วงเช้า", "C", ("floral", "musk", "citrus"), 0),
    "wedding": ("งานแต่ง", "C", ("floral", "musk", "woody"), 1),
    "afternoon_party": ("งานเลี้ยงช่วงบ่าย", "B", ("citrus", "floral", "aquatic"), 1),
    "beach": ("เที่ยวทะเล", "B", ("aquatic", "citrus", "green"), 1),
    "nature": ("เที่ยวธรรมชาติ", "B", ("green", "woody", "citrus"), 1),
    "cafe": ("ไปคาเฟ่", "B", ("musk", "gourmand", "floral"), 0),
    "gym": ("ออกกำลังกาย", "B", ("citrus", "aquatic", "musk"), 0),
    "interview": ("สัมภาษณ์งาน", "A", ("musk", "citrus", "woody"), 0),
    "ceremony": ("ร่วมพิธี", "A", ("musk", "floral", "citrus"), 0),
    "date": ("ไปเดต", "C", ("floral", "woody", "musk"), 1),
    "friends_meal": ("กินข้าวกับเพื่อน", "B", ("musk", "citrus", "floral"), 0),
}
ADVISOR_SCENARIOS = {key: label[2:] for key, label in SCENARIOS.items()}
FAMILY_NOTES = {
    "citrus": "ส้ม มะนาว เบอร์กามอต", "aquatic": "ลมทะเล เกลือ แตงกวา",
    "floral": "กุหลาบ มะลิ ดอกส้ม", "woody": "ซีดาร์ แซนดัลวูด เวติเวอร์",
    "green": "ใบชา หญ้า มอส", "gourmand": "วานิลลา คาราเมล ช็อกโกแลต",
    "amber": "อำพัน กำยาน ยางไม้", "spicy": "พริกไทย อบเชย กระวาน",
    "musk": "สบู่ แป้ง ผ้าสะอาด",
}
FAMILY_EXAMPLES = {
    "citrus": "สดซ่าแบบเปลือกส้มเพิ่งปอกหรือมะนาว",
    "aquatic": "โปร่งเย็นแบบลมทะเลหรือละอองน้ำ",
    "floral": "หอมแบบช่อดอกไม้สด เช่น กุหลาบหรือมะลิ",
    "woody": "นุ่มแบบไม้หอมแห้ง ๆ เช่น ซีดาร์หรือไม้จันทน์",
    "green": "เขียวสดคล้ายใบไม้เพิ่งขยี้หรือใบชา",
    "gourmand": "หวานอบอุ่นแบบขนมอบ วานิลลา หรือคาราเมล",
    "amber": "อุ่นลึกแบบยางไม้หอมหรือกำยาน",
    "spicy": "หอมอุ่นแบบกระวาน อบเชย หรือพริกไทย",
    "musk": "สะอาดนุ่มแบบผ้าสะอาด สบู่ หรือแป้ง",
}
ItemID = Annotated[int, Field(strict=True, ge=1)]
Level = Annotated[int, Field(strict=True, ge=0, le=2)]
Family = Literal["citrus", "aquatic", "floral", "woody", "green", "gourmand", "amber", "spicy", "musk"]
Scenario = Literal["A", "B", "C", "concert", "wedding_morning", "wedding", "afternoon_party",
                   "beach", "nature", "cafe", "gym", "interview", "ceremony", "date", "friends_meal"]
Baht = Annotated[int, Field(strict=True, ge=1, le=1_000_000)]


def validate_style(value):
    if value not in STYLES:
        raise ValueError("Unknown outfit style")
    return value


Style = Annotated[str, AfterValidator(validate_style)]


def outfit_reason(engine, styles, family):
    matches = [style for style in dict.fromkeys(styles) if ("styles", style, family) in engine.edges]
    return "ในแบบสอบถาม แนวกลิ่นนี้ถูกเลือกบ่อยในกลุ่มสไตล์ " + " / ".join(matches) if matches else None


def scoring_scenario(scenario):
    return EVENTS[scenario][1] if scenario in EVENTS else scenario


def reference_price(item, minimum=1, maximum=1_000_000):
    """Lowest recorded price in range for this exact edition, not a live quote."""
    if not (item.get("price_evidence") or "").startswith("A:"):
        return None
    price = item.get("price_ref") or ""
    amount = r"(\d{1,3}(?:,\d{3})+|\d+)"
    values = re.findall(rf"\d+(?:\.\d+)?\s*ml\s*=\s*{amount}\b", price, re.I)
    if not values:
        match = re.fullmatch(rf"(?:Central:\s*)?{amount}(?:\s*\(\d+(?:\.\d+)?\s*ml\))?", price.strip(), re.I)
        values = [match[1]] if match else []
    prices = (int(value.replace(",", "")) for value in values)
    return min((price for price in prices if minimum <= price <= maximum), default=None)


class Discovery(Payload):
    scenario: Scenario
    families: list[Family] = Field(default_factory=list, max_length=2)
    budget: Level | None = None
    min_baht: Baht | None = None
    max_baht: Baht | None = None
    sillage: Level | None = None
    gender: Literal["women", "men", "unisex"] | None = None
    styles: list[Style] = Field(default_factory=list, max_length=2)
    similar_to: ItemID | None = None
    allow_sillage_fallback: bool = False
    exclude: list[ItemID] = Field(default_factory=list, max_length=1000)
    verified_sillage_only: bool = False

    @model_validator(mode="after")
    def valid_budget(self):
        if self.min_baht is not None and self.max_baht is not None and self.min_baht > self.max_baht:
            raise ValueError("Budget lower bound exceeds the upper bound")
        return self


class AdvisorOwned(OwnedComparison):
    scenario: Scenario
    styles: list[Style] = Field(default_factory=list, max_length=2)


def discover(adapter, body):
    engine = adapter.engine
    scenario = SCENARIOS[scoring_scenario(body.scenario)]
    requested = [FAMILIES[f] for f in dict.fromkeys(body.families)]
    excluded = set(body.exclude)
    known_gender = OPPOSITE.get(body.gender)
    event = EVENTS.get(body.scenario)
    explicit_price = body.min_baht is not None or body.max_baht is not None
    prices = {}
    reference = engine.by_id.get(body.similar_to)
    if body.similar_to is not None and reference is None:
        raise HTTPException(422, "ยังไม่มีโปรไฟล์กลิ่นของขวดอ้างอิงค่ะ")
    source = engine.items[reference] if reference is not None else None
    similarity = engine.S @ engine.S[reference] if source is not None else None
    source_notes = set(source["notes"]) if source else set()
    can_relax_sillage = source is not None and body.allow_sillage_fallback and body.sillage is not None

    def choose(families, diverse=False):
        with adapter.lock:
            ranking_families = families or ([FAMILIES[key] for key in event[2]] if event else None)
            ranking_sillage = body.sillage if body.sillage is not None or not event else event[3]
            ranked = engine.recommend(scenario, families=ranking_families, sillage=ranking_sillage,
                                      budget=body.budget, k=len(engine.items))["A"]
        pool = []
        for row in ranked:
            item = engine.items[engine.by_id[row["id"]]]
            if item["id"] in excluded or item["id"] == body.similar_to:
                continue
            # In the advisor, secondary tones can help rank a bottle but cannot replace its main family.
            if families and item["family"] not in families:
                continue
            if source and (similarity[engine.by_id[item["id"]]] <= 0
                           or (item["family"] != source["family"] and not source_notes.intersection(item["notes"]))):
                continue
            if body.gender == "unisex" and item.get("gender") != "unisex":
                continue
            if body.budget is not None and (item["price_tier"] is None or item["price_tier"] > body.budget):
                continue
            if body.sillage is not None and item["sillage"] != body.sillage and not can_relax_sillage:
                continue
            if body.verified_sillage_only and item["sillage_source"] != "vote":
                continue
            if explicit_price:
                price = reference_price(item, body.min_baht or 1, body.max_baht or 1_000_000)
                if price is None:
                    continue
                prices[item["id"]] = price
            pool.append(row)
        if body.styles and not source:
            # Style can nudge the ranking; it never changes what passes a filter.
            pool.sort(key=lambda row: -(row["score"] + (
                0.04 if outfit_reason(engine, body.styles, row["family"]) else 0
            )))
        candidates = select_family_candidates(engine, pool, families, len(pool), banned_gender=known_gender)
        if source:
            candidates.sort(key=lambda row: (row[0], -similarity[engine.by_id[row[2]["id"]]], row[1]))
            if can_relax_sillage:
                exact = []
                nearby = []
                for candidate in candidates:
                    item = engine.items[engine.by_id[candidate[2]["id"]]]
                    if item["sillage"] == body.sillage:
                        exact.append(candidate)
                    elif (abs(item["sillage"] - body.sillage) == 1 and item["family"] == source["family"]
                          and source_notes.intersection(item["notes"])):
                        nearby.append(candidate)
                candidates = exact or nearby
            return candidates[:3], len(candidates)
        if not diverse:
            return select_family_candidates(engine, pool, families, 3, banned_gender=known_gender), len(candidates)
        # Keep the first shelf varied, then let the user explore the rest of the matching pool.
        selected = []
        seen_families = set()
        for candidate in candidates:
            family = candidate[2]["family"]
            if family not in seen_families:
                selected.append(candidate)
                seen_families.add(family)
            if len(selected) == 3:
                break
        ids = {candidate[2]["id"] for candidate in selected}
        selected.extend(candidate for candidate in candidates if candidate[2]["id"] not in ids)
        return selected[:3], len(candidates)

    selected, available = choose(requested, diverse=not requested)
    items = []
    for _, _, row, matched in selected:
        item = engine.items[engine.by_id[row["id"]]]
        reasons = []
        if requested:
            reasons.append("แนวกลิ่นหลักตรงกับที่เลือก: " + item["family"])
            secondary = [family for family in matched if family != item["family"]]
            if secondary:
                reasons.append("โปรไฟล์กลิ่นมีโทนของ " + " / ".join(secondary) + " ประกอบ")
        else:
            reasons.append("ตัวอย่างของแนว " + item["family"])
        if reason := outfit_reason(engine, body.styles, item["family"]):
            reasons.append(reason)
        if source:
            same_family = item["family"] == source["family"]
            reasons.insert(0, "อยู่ในแนวกลิ่นหลักเดียวกับขวดอ้างอิง" if same_family
                           else "มีโน้ตบางตัวตรงกับขวดอ้างอิง แต่แนวกลิ่นหลักต่างกัน")
        if body.budget is not None:
            reasons.append("ช่วงราคาอ้างอิงไม่เกินงบที่เลือก")
        if explicit_price:
            reasons.append("ราคาอ้างอิงของรุ่นนี้อยู่ในวงเงินที่พิมพ์ ควรเช็กราคาปัจจุบันอีกครั้ง")
        items.append({
            **{k: item[k] for k in ("id", "brand", "name", "family", "url", "price_tier", "price_evidence")},
            "image_url": adapter.images.get(item["url"], ""),
            "gender": GENDER_TH.get(item.get("gender"), ""),
            "price": f"อ้างอิง {prices[item['id']]:,} บาท" if explicit_price else row["price"],
            "reference_baht": prices.get(item["id"]),
            "sillage": row["sillage"], "sillage_level": item["sillage"],
            "sillage_estimated": item["sillage_source"] != "vote", "reasons": reasons,
            "scent": scent_description(item),
            "shopping_links": shopping_links(item),
        })
    return {"items": items, "explore": not requested and source is None, "has_more": available > len(items),
            "sillage_fallback": can_relax_sillage and any(item["sillage_level"] != body.sillage for item in items),
            "scent_comparison": compare_scents(items)}


def create_app():
    load_dotenv(ROOT / ".env", override=False)
    adapter = EngineAdapterV3()
    index = OwnedIndex(adapter.engine.items, ROOT / "study/owned_index.json")
    app = FastAPI(title="Senna Advisor", docs_url=None, redoc_url=None, openapi_url=None)
    assets = ROOT / "static/advisor"

    @app.get("/advisor/api/health")
    def health():
        return {"mode": "product_preview", "catalog_items": len(adapter.engine.items),
                "catalog_sha256": adapter.catalog_hash, "research_data_saved": False}

    @app.get("/advisor/assets/chat-theme.css", include_in_schema=False)
    def chat_theme():
        return FileResponse(ROOT / "static/study_v3/senna.css", media_type="text/css")

    app.mount("/advisor/assets", StaticFiles(directory=assets), name="advisor-assets")

    @app.get("/")
    def root():
        return RedirectResponse("/advisor")

    @app.get("/advisor")
    def page():
        return FileResponse(assets / "index.html", headers={
            "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
            "Content-Security-Policy": "default-src 'self'; script-src 'self' https://www.googletagmanager.com; "
            "connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com; "
            "style-src 'self' https://fonts.googleapis.com; "
            "font-src https://fonts.gstatic.com; img-src 'self' https://fimgs.net data: blob:; "
            "object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        })

    @app.get("/advisor/api/integrations")
    def integrations():
        measurement_id = os.getenv("SCENTSELF_ADVISOR_GA4_ID", "").strip()
        return {"ga4_measurement_id": measurement_id if re.fullmatch(r"G-[A-Z0-9]{6,20}", measurement_id) else None}

    @app.get("/advisor/api/options")
    def options():
        return {"families": FAMILIES, "family_notes": FAMILY_NOTES, "family_examples": FAMILY_EXAMPLES,
                "scenarios": ADVISOR_SCENARIOS, "events": {key: event[0] for key, event in EVENTS.items()},
                "budget": TIER_TH, "sillage": SILLAGE_TH, "styles": STYLES}

    @app.post("/advisor/api/discover")
    def find(body: Discovery):
        return discover(adapter, body)

    @app.get("/advisor/api/owned/search")
    def search(q: str = Query(max_length=100), offset: int = Query(0, ge=0, le=10000)):
        items, next_offset = index.search(q, offset)
        return {"items": items, "next_offset": next_offset}

    @app.post("/advisor/api/owned")
    def owned(body: AdvisorOwned):
        try:
            base = OwnedComparison(**body.model_dump(exclude={"styles", "scenario"}), scenario=scoring_scenario(body.scenario))
            result = assess_private(adapter, base, index.extra)
        except ValueError as error:
            raise HTTPException(422, str(error)) from None
        for card in result["items"]:
            key = card["id"]
            item = adapter.engine.items[adapter.engine.by_id[key]] if key in adapter.engine.by_id else index.extra[key]
            card["scent"] = scent_description(item)
            card["edition"] = index.editions.get(key)
            card["shopping_links"] = shopping_links({**item, "edition": card["edition"]})
            if reason := outfit_reason(adapter.engine, body.styles, card["family"]):
                card["reasons"].append(reason)
            if body.scenario in EVENTS and card["assessment_code"] == "consider":
                card["assessment"] = "เป็นตัวเลือกที่น่าพิจารณาตามแนวกลิ่นและระดับการกระจายที่เลือก"
        result["scenario"] = EVENTS[body.scenario][0] if body.scenario in EVENTS else ADVISOR_SCENARIOS[body.scenario]
        result["scent_comparison"] = compare_scents(result["items"])
        return result

    return app
