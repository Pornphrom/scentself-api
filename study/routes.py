import hashlib
import json
import secrets
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException, Query
from fastapi.responses import Response
from engine_v2.family_eligibility import NoEligibleFragrances

from .adapter import EngineAdapter
from .explanations import Explainer
from .schemas import BUDGET, CONFIDENCE, EXPERIENCE, FAMILIES, IMAGES, SCENARIOS, STYLES, USAGE, Completion, Pre, Preferences, Start, Viewed
from .store import StateConflict, Store


def compare_sets(sets):
    first, second = ([item["id"] for item in group["items"]] for group in sets)
    shared = sorted(set(first) & set(second))
    return {"shared_item_ids": shared, "overlap_count": len(shared),
            "identical_items": set(first) == set(second), "identical_order": first == second}


def make_router(settings, store=None, adapter=None, explainer=None):
    router = APIRouter(prefix="/v2", tags=["Pilot study"])
    if store is None:
        if settings.database_url:
            from .postgres_store import PostgresStore
            store = PostgresStore(settings.database_url, settings.mode)
        else:
            store = Store(settings.data_dir / "sessions.sqlite3")
    adapter = adapter or EngineAdapter()
    explainer = explainer or Explainer(settings, budget_reserver=getattr(store, "reserve_provider_attempt", None))

    def secret_from(authorization):
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(401, "ต้องใช้รหัสเซสชัน")
        token = authorization[7:]
        if len(token) > 256:
            raise HTTPException(401, "รหัสเซสชันไม่ถูกต้อง")
        return token

    def read(sid, authorization):
        secret = secret_from(authorization)
        try:
            return store.get(sid, secret), secret
        except PermissionError:
            raise HTTPException(404, "ไม่พบเซสชันนี้") from None

    def move(sid, token, expected, target, patch):
        try:
            return store.transition(sid, token, expected, target, patch)
        except StateConflict:
            raise HTTPException(409, "สถานะเปลี่ยนแล้ว กรุณาโหลดข้อมูลอีกครั้ง") from None

    def public(session):
        data = session["data"]
        result = {"session_id": session["id"], "participant_id": session["id"], "state": session["state"], "pilot": data.get("pilot", True)}
        if session["state"] == "withdrawn":
            return result
        if session["state"] != "complete":
            result["pre"] = data.get("pre")
            result["preferences"] = data.get("preferences")
        if "cards" in data and session["state"] != "complete":
            result["sets"] = [{"slot": slot, "label": f"ชุดที่ {i + 1}", "items": [data["cards"][key] for key in sorted(data["cards"], key=lambda key: int(key[1:])) if key.startswith(method)]} for i, (slot, method) in enumerate(zip(["first", "second"], data["order_AB"]))]
            result["comparison"] = compare_sets(result["sets"])
            result["families_from_popularity"] = data["engine_result"]["request"]["families_from_popularity"]
            result["selected_family_labels"] = data["engine_result"]["request"]["families"]
            result["viewed"] = data.get("viewed", {})
            result["family_eligibility_policy"] = data["engine_result"]["request"].get("family_eligibility_policy")
            result["fewer_than_requested"] = data["engine_result"]["request"].get("fewer_than_requested", False)
        return result

    @router.get("/health")
    def health():
        return {"status": "ok", "mode": settings.mode, "catalog_items": len(adapter.engine.items), "catalog_sha256": adapter.catalog_hash, "engine": getattr(adapter, "engine_version", "v2.1"), "protocol": settings.protocol, "llm_provider": settings.llm_provider, "llm_model": settings.llm_model, "llm_key_configured": bool(settings.api_key), "storage": "postgres" if settings.database_url else "sqlite"}

    @router.get("/study/config")
    def config():
        return {"mode": settings.mode, "contact": settings.contact, "retention_until": settings.retention_until, "protocol": settings.protocol,
                "usage": USAGE, "experience": EXPERIENCE, "budget": BUDGET, "scenarios": SCENARIOS,
                "families": FAMILIES, "images": IMAGES, "styles": STYLES, "confidence": CONFIDENCE,
                "consent_version": settings.consent_version, "ui_version": settings.ui_version, "catalog_items": len(adapter.engine.items)}

    @router.get("/search")
    def search(q: str = Query(default="", max_length=100)):
        return {"items": adapter.search(q)}

    @router.post("/study/sessions")
    def start(body: Start):
        sid = str(body.request_id)
        payload = {"pilot": settings.mode == "pilot", "consent": True, "eligible": True,
                   "protocol": settings.protocol, "consent_version": settings.consent_version,
                   "retention_until": settings.retention_until,
                   "ui_version": settings.ui_version,
                   "catalog_sha256": adapter.catalog_hash, "engine_version": getattr(adapter, "engine_version", "v2.1"),
                   "llm_config": {"provider": settings.llm_provider, "model": settings.llm_model},
                   "order_AB": secrets.choice(["AB", "BA"]), "started_utc": datetime.now(timezone.utc).isoformat()}
        try:
            session = store.create(sid, body.client_secret, payload)
        except PermissionError:
            raise HTTPException(409, "รหัสคำขอนี้มีอยู่แล้ว") from None
        return public(session)

    @router.post("/study/sessions/{sid}/view")
    def viewed(sid: str, body: Viewed, authorization: str | None = Header(default=None)):
        session, token = read(sid, authorization)
        if session["state"] != "recommended":
            raise HTTPException(409, "ยังไม่มีชุดคำแนะนำให้บันทึกการแสดงผล")
        try:
            session = store.mark_viewed(sid, token, body.slot, datetime.now(timezone.utc).isoformat())
        except StateConflict:
            raise HTTPException(409, "เซสชันนี้ไม่ได้อยู่ระหว่างแสดงคำแนะนำ") from None
        return {"viewed": session["data"]["viewed"]}

    @router.get("/study/sessions/{sid}")
    def get_session(sid: str, authorization: str | None = Header(default=None)):
        session, token = read(sid, authorization)
        if session["state"] == "generating" and time.time() - session["updated"] > 90:
            session = move(sid, token, ["generating"], "pre_ready", {"generation_recovered": True})
        return public(session)

    @router.put("/study/sessions/{sid}/pre")
    def pre(sid: str, body: Pre, authorization: str | None = Header(default=None)):
        session, token = read(sid, authorization)
        values = body.model_dump()
        if session["state"] == "pre_ready" and session["data"].get("pre") == values:
            return public(session)
        return public(move(sid, token, ["intake"], "pre_ready", {"pre": values, "pre_saved_utc": datetime.now(timezone.utc).isoformat()}))

    @router.post("/study/sessions/{sid}/recommend")
    def recommend(sid: str, body: Preferences, authorization: str | None = Header(default=None)):
        session, token = read(sid, authorization)
        preferences = body.model_dump()
        if session["state"] in {"recommended", "complete"}:
            if preferences != {"scent_gender": None, **(session["data"].get("preferences") or {})}:   # sessions saved before 6 Nov have no scent_gender
                raise HTTPException(409, "คำแนะนำถูกบันทึกแล้ว ไม่สามารถเปลี่ยนความต้องการในรอบนี้")
            return public(session)
        if session["state"] == "generating" and time.time() - session["updated"] > 90:
            session = move(sid, token, ["generating"], "pre_ready", {"generation_recovered": True})
        if session["state"] != "pre_ready":
            raise HTTPException(409, "กรุณาบันทึกแบบประเมินก่อนใช้ หรือรอคำขอที่กำลังทำงาน")
        expected_llm = {"provider": settings.llm_provider, "model": settings.llm_model}
        data = session["data"]
        # Sessions predating explicit engine versioning were produced by v2.1.
        expected_engine = getattr(adapter, "engine_version", "v2.1")
        if (data["catalog_sha256"] != adapter.catalog_hash
                or data.get("engine_version", "v2.1") != expected_engine
                or data["llm_config"] != expected_llm
                or data["protocol"] != settings.protocol):
            raise HTTPException(409, "เวอร์ชันระบบเปลี่ยนหลังเริ่มรอบนี้ กรุณาถอนตัวรอบเดิมแล้วเริ่มใหม่")
        if preferences["favorite_id"] is not None and preferences["favorite_id"] not in adapter.engine.by_id:
            raise HTTPException(422, "ไม่พบน้ำหอมที่เลือกในฐานข้อมูล")
        move(sid, token, ["pre_ready"], "generating", {})
        try:
            engine_result, cards = adapter.recommend(session["data"]["pre"], preferences)
            explanation_meta = explainer.explain(cards)
            comparison = compare_sets([{"items": [cards[key] for key in sorted(cards, key=lambda key: int(key[1:])) if key.startswith(method)]} for method in session["data"]["order_AB"]])
        except NoEligibleFragrances as error:
            move(sid, token, ["generating"], "pre_ready", {})
            raise HTTPException(422, str(error)) from None
        except Exception:
            try:
                move(sid, token, ["generating"], "pre_ready", {})
            except HTTPException:
                pass
            raise HTTPException(503, "ยังเตรียมคำแนะนำไม่สำเร็จ กรุณาลองอีกครั้ง ข้อมูลก่อนใช้ยังอยู่") from None
        session = move(sid, token, ["generating"], "recommended", {"preferences": preferences, "engine_result": engine_result,
                          "cards": cards, "comparison": comparison, "explanation_meta": explanation_meta, "recommended_utc": datetime.now(timezone.utc).isoformat()})
        return public(session)

    @router.post("/study/sessions/{sid}/complete")
    def complete(sid: str, body: Completion, authorization: str | None = Header(default=None)):
        session, token = read(sid, authorization)
        answers = body.model_dump()
        if session["state"] == "complete":
            if session["data"].get("completion") != answers:
                raise HTTPException(409, "ส่งแบบประเมินแล้ว ไม่สามารถเขียนทับคำตอบ")
            return public(session)
        if session["state"] != "recommended":
            raise HTTPException(409, "กรุณาดูคำแนะนำก่อนส่งแบบประเมินหลังใช้")
        if set(session["data"].get("viewed", {})) != {"first", "second"}:
            raise HTTPException(409, "กรุณาดูคำแนะนำทั้งสองชุดก่อนส่งแบบประเมิน")
        data, pre = session["data"], session["data"]["pre"]
        ratings = dict(zip(data["order_AB"], [body.relevance_first, body.relevance_second]))
        row = {"participant_id": sid, "pilot": int(data["pilot"]), "consent": 1,
               **{k: pre[k] for k in ["q5_usage", "q6_experience", "q21_budget", "scenario"]},
               **{f"pre{i + 1}": v for i, v in enumerate(pre["scores"])},
               **{f"post{i + 1}": v for i, v in enumerate(body.post)},
               "relevance_A": ratings["A"], "relevance_B": ratings["B"], "order_AB": data["order_AB"],
               **{k: answers[k] for k in ["satisfaction", "clarity", "usefulness", "intention", "use_again"]},
               "attention_ok": int(body.attention_answer == 2), "duration_sec": round(max(0, time.time() - session["started"]), 3), "lca_class": None}
        session = move(sid, token, ["recommended"], "complete", {"completion": answers, "analysis_row": row, "completed_utc": datetime.now(timezone.utc).isoformat()})
        return public(session)

    @router.delete("/study/sessions/{sid}")
    def withdraw(sid: str, authorization: str | None = Header(default=None)):
        _, token = read(sid, authorization)
        store.withdraw(sid, token)
        return {"state": "withdrawn"}

    def admin(authorization):
        if not settings.admin_token:
            raise HTTPException(503, "ยังไม่เปิดการส่งออกผ่านเว็บ ใช้เครื่องมือส่งออกในเครื่องผู้วิจัย")
        token = secret_from(authorization)
        if not secrets.compare_digest(token, settings.admin_token):
            raise HTTPException(403, "ไม่อนุญาต")

    @router.get("/admin/export.csv")
    def export_csv(authorization: str | None = Header(default=None)):
        admin(authorization)
        text, _ = store.export()
        return Response(content="\ufeff" + text, media_type="text/csv; charset=utf-8", headers={"Content-Disposition": 'attachment; filename="ScentSelf_PrePost_Log.csv"', "Cache-Control": "no-store"})

    @router.get("/admin/audit.json")
    def export_audit(authorization: str | None = Header(default=None)):
        admin(authorization)
        _, audit = store.export()
        return Response(content=json.dumps(audit, ensure_ascii=False), media_type="application/json", headers={"Cache-Control": "no-store"})

    return router
