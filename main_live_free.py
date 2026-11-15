"""Dedicated main-study entry point; never start in pilot mode or use local storage."""
import os
from datetime import date
from html import escape

from dotenv import load_dotenv
from fastapi.responses import HTMLResponse, JSONResponse
from psycopg.conninfo import conninfo_to_dict

from study.config import ROOT, Settings
from study.postgres_store import validate_database_url

CONSENT = 'live-consent-20261107'
MODEL = 'gemini-3.5-flash-lite'
MAX_DAILY_ATTEMPTS = 150
COLLECTION_CLOSED = "ปิดรับคำตอบรอบวิจัยแล้ว"


def close_collection(app, contact):
    @app.middleware("http")
    async def closed_study(request, call_next):
        path = request.url.path.rstrip("/") or "/"
        if request.method in {"GET", "HEAD"} and path in {"/", "/senna", "/senna/wardrobe"}:
            return HTMLResponse(f"""<!doctype html>
<html lang="th"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{COLLECTION_CLOSED} | Senna</title>
<body style="margin:0;color:#20312c;background:#f4f7f5;font:1rem/1.7 system-ui,sans-serif">
<main style="max-width:38rem;margin:12vh auto;padding:0 1.5rem">
<p>Senna · ScentSelf</p>
<h1>{COLLECTION_CLOSED}</h1>
<p>ขอบคุณทุกคนที่ร่วมทดลองใช้ Senna ค่ะ ตอนนี้ไม่รับคำตอบเพิ่มเติมแล้ว</p>
<p>หากต้องการถอนข้อมูลที่เคยส่งไว้ กรุณาติดต่อผู้วิจัยเป็นการส่วนตัวพร้อมรหัสผู้เข้าร่วม</p>
<p>ช่องทางติดต่อ: {escape(contact)}</p>
</main></body></html>""", headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
                                    "X-Content-Type-Options": "nosniff",
                                    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'"})
        if request.method in {"POST", "PUT", "PATCH"} and any(
            path == prefix or path.startswith(prefix + "/")
            for prefix in ("/v2/study/sessions", "/v2/owned-study/sessions")
        ):
            return JSONResponse({"detail": COLLECTION_CLOSED}, status_code=410, headers={"Cache-Control": "no-store"})
        return await call_next(request)

    return app


def validate_live_hosting(settings, database_host):
    if settings.mode != 'live' or not settings.live_confirmed:
        raise ValueError('Hosted main study requires explicit live confirmation')
    if settings.consent_version != CONSENT or not settings.contact.strip():
        raise ValueError('Hosted main study requires reviewed consent and a contact channel')
    if len(settings.admin_token) < 32:
        raise ValueError('Hosted main study requires a strong admin token')
    try:
        retention = date.fromisoformat(settings.retention_until)
    except ValueError:
        raise ValueError('Confirm main-study retention as YYYY-MM-DD') from None
    if retention <= date.today():
        raise ValueError('Main-study retention date must be in the future')
    if settings.llm_provider != 'gemini' or settings.llm_model != MODEL or not settings.api_key:
        raise ValueError('Hosted main study requires the reviewed Gemini configuration')
    if not 1 <= settings.llm_daily_limit <= MAX_DAILY_ATTEMPTS:
        raise ValueError('Hosted main study requires a bounded daily provider limit')
    validate_database_url(settings.database_url)
    if not database_host or conninfo_to_dict(settings.database_url).get('host') != database_host:
        raise ValueError('Hosted main study requires the assigned live PostgreSQL endpoint')


def create_app():
    load_dotenv(ROOT / '.env')
    settings = Settings.from_env()
    validate_live_hosting(settings, os.getenv('SCENTSELF_LIVE_DATABASE_HOST', ''))
    from main_v3 import create_app as create_v3_app
    return close_collection(create_v3_app(settings), settings.contact)
