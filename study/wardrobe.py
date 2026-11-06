"""Stateless advice for an owned collection, outside the pre/post study protocol."""
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException
import numpy as np
from pydantic import Field, field_validator

from engine_v2.engine_v2 import SILLAGE_TH, TIER_TH
from engine_v2.family_eligibility import PROFILE_SUPPORT, family_match
from .schemas import FAMILIES, SCENARIOS, Payload

SCENARIO_WEIGHT = 0.15  # Prototype utility only, not a fitted/validated research weight.
OWNED_POLICY = "owned-prototype-v1.2-ab-20261104"
ALTERNATIVES_POLICY = "after-owned-discovery-ab-v2-family-gate-20261104"


def owned_scores(engine, families, sillage, scenario, method="A"):
    scent = engine._score(method, families, sillage, None, None) - engine.AVB * engine.central
    shares = engine.meta["scenario_family_share"].get(scenario, {})
    context = engine.P @ np.array([shares.get(family, 0) for family in engine.fams])
    return scent + SCENARIO_WEIGHT * engine._mm(context)


class OwnedComparison(Payload):
    owned_ids: list[Annotated[int, Field(strict=True, ge=1)]] = Field(min_length=1, max_length=10)
    scenario: Literal["A", "B", "C"]
    families: list[str] = Field(default_factory=list, max_length=2)
    sillage: Annotated[int, Field(strict=True, ge=0, le=2)] | None = None

    @field_validator("owned_ids", "families")
    @classmethod
    def unique_choices(cls, value, info):
        if len(set(value)) != len(value):
            raise ValueError("Duplicate selection")
        if info.field_name == "families" and any(v not in FAMILIES for v in value):
            raise ValueError("Unknown scent family")
        return value


class Alternatives(OwnedComparison):
    budget: Annotated[int, Field(strict=True, ge=0, le=2)] | None = None


def assess_owned(adapter, body, method="A"):
    engine = adapter.engine
    if any(i not in engine.by_id for i in body.owned_ids):
        raise ValueError("มีรุ่นที่ไม่พบในฐานข้อมูล กรุณาเลือกจากผลค้นหาอีกครั้ง")
    families = [FAMILIES[f] for f in body.families] or None
    # Reuse Method A's frozen scent logic. Owned bottles need no shopping bonus,
    # budget penalty, or exclusion as a previously liked bottle.
    with adapter.lock:
        result = engine.recommend(SCENARIOS[body.scenario], families=families,
                                  sillage=body.sillage, budget=None, favorite_id=None, k=len(engine.items))
        scores = owned_scores(engine, result["request"]["families"], body.sillage, SCENARIOS[body.scenario], method)
        order = sorted(body.owned_ids, key=lambda i: (-float(scores[engine.by_id[i]]), i))
    raw = {item["id"]: item for item in result[method]}
    items = []
    for i in order:
        item, record = engine.items[engine.by_id[i]], raw[i]
        reasons = [r for r in record["reasons"] if r != "หาซื้อได้ที่ Central"]
        reasons = [r.replace("มีส่วนผสมของทั้ง", "มีลักษณะกลิ่นของทั้ง", 1) for r in reasons]
        # Avoid suggesting a dose as a substitute for a mismatched sillage level.
        reasons = [r for r in reasons if not r.startswith("กลิ่นระดับปานกลาง:")]
        if not reasons:
            reasons = [f"แนวกลิ่นหลักที่บันทึก: {item['family']}"]
        cautions = []
        if body.sillage is not None and item["sillage"] != body.sillage:
            cautions.append(f"ระดับกลิ่นที่บันทึกเป็น{SILLAGE_TH[item['sillage']]} ต่างจาก{SILLAGE_TH[body.sillage]}ที่เลือก")
        if item["sillage_source"] != "vote":
            cautions.append("ระดับการกระจายกลิ่นเป็นค่าประมาณ ไม่ใช่ผลโหวตจริง")
        if body.sillage is not None and item["sillage_source"] == "vote" and item["sillage"] > body.sillage:
            assessment_code = "stronger_than_requested"
            assessment = "ควรระวัง: การกระจายกลิ่นชัดกว่าระดับที่ต้องการ"
        elif body.sillage is not None and item["sillage_source"] == "vote" and item["sillage"] < body.sillage:
            assessment_code = "weaker_than_requested"
            assessment = "น่าพิจารณา แต่การกระจายกลิ่นเบากว่าระดับที่ต้องการ"
        elif item["sillage_source"] != "vote":
            assessment_code = "estimated"
            assessment = "น่าพิจารณาจากแนวกลิ่น แต่ข้อมูลการกระจายกลิ่นยังเป็นค่าประมาณ"
        elif families and item["family"] not in families:
            assessment_code = "family_differs"
            assessment = "ควรเทียบกลิ่นก่อน: แนวหลักต่างจากแนวที่อยากได้"
        else:
            assessment_code = "consider"
            assessment = f"เป็นตัวเลือกที่น่าพิจารณาสำหรับ{SCENARIOS[body.scenario][2:]}ตามข้อมูลกลิ่น"
        items.append({"id": i, "brand": item["brand"], "name": item["name"], "family": item["family"],
                      "sillage": SILLAGE_TH[item["sillage"]], "sillage_estimated": item["sillage_source"] != "vote",
                      "image_url": adapter.images.get(item["url"], ""), "url": item["url"],
                      "reasons": reasons, "cautions": cautions, "assessment": assessment, "assessment_code": assessment_code})
    return {"mode": "owned_collection", "policy_version": OWNED_POLICY, "research_data_saved": False, "scenario": SCENARIOS[body.scenario],
            "families": result["request"]["families"], "families_from_popularity": not bool(body.families),
            "items": items, "engine": adapter.engine_version, "catalog_sha256": adapter.catalog_hash}


def alternative_family_match(engine, item, requested):
    return family_match(engine, item, requested)


def suggest_alternatives(adapter, body, method="A"):
    engine = adapter.engine
    if any(i not in engine.by_id for i in body.owned_ids):
        raise ValueError("ไม่พบขวดเดิมบางรุ่นในฐานข้อมูล")
    budget = body.budget if body.budget in (0, 1) else None
    with adapter.lock:
        result = engine.recommend(SCENARIOS[body.scenario], families=[FAMILIES[f] for f in body.families] or None,
                                  sillage=body.sillage, budget=budget, k=len(engine.items))
    items = []
    owned = [engine.items[engine.by_id[i]] for i in body.owned_ids]
    requested = [FAMILIES[f] for f in body.families]
    candidates = []
    for rank, raw in enumerate(result[method]):
        if raw['id'] in body.owned_ids:
            continue
        item = engine.items[engine.by_id[raw['id']]]
        tier, matched = alternative_family_match(engine, item, requested)
        if tier is not None:
            candidates.append((tier, rank, raw, item, matched))
    # Both methods share these eligibility tiers; retain their own ranking within each tier.
    candidates.sort(key=lambda candidate: candidate[:2])
    for tier, _, raw, item, matched in candidates[:3]:
        differences = []
        if (body.sillage is not None and item['sillage_source'] == 'vote' and item['sillage'] == body.sillage
                and all(it['sillage_source'] == 'vote' and it['sillage'] != body.sillage for it in owned)):
            differences.append("ระดับการกระจายกลิ่นที่บันทึกตรงกับที่ขอ ขณะที่ขวดเดิมที่เลือกยังไม่ตรงระดับนี้")
        if (body.families and item['family'] in [FAMILIES[f] for f in body.families]
                and all(it['family'] != item['family'] for it in owned)):
            differences.append(f"แนวหลักที่บันทึกเป็น{item['family']} ต่างจากแนวหลักของขวดเดิมที่เลือก")
        if not differences:
            differences.append("เป็นตัวเลือกนอกขวดที่มี ยังไม่ได้ยืนยันว่าตรงกว่าขวดเดิมทุกด้าน")
        reasons = [r.replace('มีส่วนผสมของทั้ง', 'มีลักษณะกลิ่นของทั้ง', 1) for r in raw['reasons']
                   if not r.startswith('กลิ่นระดับปานกลาง:') and r != 'หาซื้อได้ที่ Central' and not r.startswith('อยู่ในงบ')]
        match_label = ''
        if requested:
            match_label = ('ตรงสองแนวที่ขอ: ' if len(requested) == len(matched) == 2 else
                           'ตรงบางแนวที่ขอ: ' if len(matched) < len(requested) else 'แนวที่ตรงคำขอ: ') + ' / '.join(matched)
            reasons.insert(0, match_label + ' ตามโปรไฟล์กลิ่นในฐานข้อมูล')
            if item['family'] not in requested:
                reasons.insert(1, f"แนวหลักคือ{item['family']} แต่มีโทนรองที่รองรับทั้งสองแนว ไม่ใช่แนวหลักที่ตรงคำขอ")
            if len(matched) < len(requested):
                reasons.insert(1, 'เป็นตัวเลือกที่ตรงเพียงบางแนว ยังไม่รองรับครบสองแนวที่เลือก')
        if budget is not None and item['price_tier'] is not None and item['price_tier'] <= budget:
            reasons.append('ระดับราคาที่บันทึกไม่เกินช่วงงบที่เลือก ควรตรวจราคาปัจจุบันอีกครั้ง')
        items.append({"id": item['id'], "brand": item['brand'], "name": item['name'], "family": item['family'],
                      "sillage": SILLAGE_TH[item['sillage']], "sillage_estimated": item['sillage_source'] != 'vote',
                      "price": TIER_TH[item['price_tier']] if item['price_tier'] is not None else 'ยังไม่ทราบระดับราคา',
                      "over_budget": budget is not None and item['price_tier'] is not None and item['price_tier'] > budget,
                      "price_evidence": item['price_evidence'], "availability": item['thai_status'],
                      "image_url": adapter.images.get(item['url'], ''), "url": item['url'],
                      "family_match_label": match_label, "matched_families": matched,
                      "family_match_complete": len(matched) == len(requested) if requested else None,
                      "reasons": reasons or ['เป็นตัวเลือกจากการจัดอันดับข้อมูลกลิ่นในฐานข้อมูล'], "differences": differences})
    return {"mode": "owned_to_discovery", "research_data_saved": False,
            "policy_version": ALTERNATIVES_POLICY,
            "context": body.model_dump(), "items": items}


def make_wardrobe_router(adapter):
    router = APIRouter(prefix="/v2/wardrobe", tags=["Owned collection (not study)"])

    @router.post("/compare")
    def compare(body: OwnedComparison):
        try:
            return assess_owned(adapter, body)
        except ValueError as error:
            raise HTTPException(422, str(error)) from None

    @router.post("/alternatives")
    def alternatives(body: Alternatives):
        try:
            return suggest_alternatives(adapter, body)
        except ValueError as error:
            raise HTTPException(422, str(error)) from None

    return router
