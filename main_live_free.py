"""Dedicated main-study entry point; never start in pilot mode or use local storage."""
import os
from datetime import date

from dotenv import load_dotenv
from psycopg.conninfo import conninfo_to_dict

from study.config import ROOT, Settings
from study.postgres_store import validate_database_url

CONSENT = 'live-consent-20261107'
MODEL = 'gemini-3.5-flash-lite'
MAX_DAILY_ATTEMPTS = 150


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
    return create_v3_app(settings)
