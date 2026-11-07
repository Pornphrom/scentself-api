# main_v3.py: separate entry point for the Senna chat UI v3 (1 Nov 2026).
# Uses catalog_v3.3 + engine v2.3 via study_v3_adapter.EngineAdapterV3 (6 Nov 2026: optional scent-gender question;
# 3 Nov: catalog_v3.2 + v2.2; 1 Nov: catalog_v3 + v2.1).
# Shares the /v2 study API and storage code; main.py and /study remain separate.
# Run:  python -m uvicorn main_v3:app --host 127.0.0.1 --port 8766   then open http://127.0.0.1:8766/senna
import dataclasses
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

load_dotenv()

from study.config import Settings
from study.routes import make_router
from study.wardrobe import make_wardrobe_router
from study.owned_study import make_owned_study_router
from study_v3_adapter import EngineAdapterV3

UI_VERSION = "senna-chat-v3-q24-problems-20261107"  # + intake Q24 for plan v2 S3; previous: senna-chat-v3-family-gate-20261107
STATIC = Path(__file__).resolve().parent / "static" / "study_v3"

CSP = ("default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; "
       "font-src 'self' https://fonts.gstatic.com; img-src 'self' https://fimgs.net data:; connect-src 'self'; "
       "object-src 'none'; base-uri 'self'; frame-ancestors 'none'")


def create_app(settings=None):
    settings = dataclasses.replace(settings or Settings.from_env(), ui_version=UI_VERSION)
    app = FastAPI(title="ScentSelf Senna v3", docs_url=None, redoc_url=None)
    adapter = EngineAdapterV3()
    app.include_router(make_router(settings, adapter=adapter))
    app.include_router(make_wardrobe_router(adapter))
    app.include_router(make_owned_study_router(settings, adapter))
    app.mount("/senna/assets", StaticFiles(directory=str(STATIC)), name="senna-v3-assets")

    @app.middleware("http")
    async def headers(request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/v2/"):
            response.headers["Cache-Control"] = "no-store"
            response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.get("/", include_in_schema=False)
    def root():
        return RedirectResponse("/senna")

    @app.get("/senna", include_in_schema=False)
    def senna_page():
        return FileResponse(STATIC / "index.html", headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
                                                             "X-Content-Type-Options": "nosniff", "Content-Security-Policy": CSP})

    @app.get("/senna/wardrobe", include_in_schema=False)
    def wardrobe_page():
        return FileResponse(STATIC / "wardrobe.html", headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
                                                                 "X-Content-Type-Options": "nosniff", "Content-Security-Policy": CSP})
    return app


app = create_app()
