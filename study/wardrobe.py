"""Stateless advice for an owned collection, outside the pre/post study protocol."""
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException
import numpy as np
from pydantic import Field, field_validator

from engine_v2.engine_v2 import SILLAGE_TH
from .schemas import FAMILIES, SCENARIOS, Payload

SCENARIO_WEIGHT = 0.15  # Prototype utility only, not a fitted/validated research weight.


def owned_scores(engine, families, sillage, scenario):
    scent = engine._score("A", families, sillage, None, None) - engine.AVB * engine.central
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


def assess_owned(adapter, body):
    engine = adapter.engine
    if any(i not in engine.by_id for i in body.owned_ids):
        raise ValueError("มีรุ่นที่ไม่พบในฐานข้อมูล กรุณาเลือกจากผลค้นหาอีกครั้ง")
    families = [FAMILIES[f] for f in body.families] or None
    # Reuse Method A's frozen scent logic. Owned bottles need no shopping bonus,
    # budget penalty, or exclusion as a previously liked bottle.
    with adapter.lock:
        result = engine.recommend(SCENARIOS[body.scenario], families=families,
                                  sillage=body.sillage, budget=None, favorite_id=None, k=len(engine.items))
        scores = owned_scores(engine, result["request"]["families"], body.sillage, SCENARIOS[body.scenario])
        order = sorted(body.owned_ids, key=lambda i: (-float(scores[engine.by_id[i]]), i))
    raw = {item["id"]: item for item in result["A"]}
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
        items.append({"id": i, "brand": item["brand"], "name": item["name"], "family": item["family"],
                      "sillage": SILLAGE_TH[item["sillage"]], "sillage_estimated": item["sillage_source"] != "vote",
                      "image_url": adapter.images.get(item["url"], ""), "url": item["url"],
                      "reasons": reasons, "cautions": cautions})
    return {"mode": "owned_collection", "policy_version": "owned-prototype-v1-20261104", "research_data_saved": False, "scenario": SCENARIOS[body.scenario],
            "families": result["request"]["families"], "families_from_popularity": not bool(body.families),
            "items": items, "engine": adapter.engine_version, "catalog_sha256": adapter.catalog_hash}


def make_wardrobe_router(adapter):
    router = APIRouter(prefix="/v2/wardrobe", tags=["Owned collection (not study)"])

    @router.post("/compare")
    def compare(body: OwnedComparison):
        try:
            return assess_owned(adapter, body)
        except ValueError as error:
            raise HTTPException(422, str(error)) from None

    return router
