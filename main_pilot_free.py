"""Free Render + external durable PostgreSQL; never fall back to local storage."""
from dotenv import load_dotenv

from main_pilot import validate_hosted_pilot
from study.config import ROOT, Settings
from study.postgres_store import validate_database_url


def validate_free_hosting(settings):
    validate_hosted_pilot(settings)
    if not settings.database_url:
        raise ValueError("Free hosting requires external PostgreSQL; local SQLite is not durable")
    validate_database_url(settings.database_url)


def create_app():
    load_dotenv(ROOT / ".env")
    settings = Settings.from_env()
    validate_free_hosting(settings)
    from main_v3 import create_app as create_v3_app
    return create_v3_app(settings)
