"""Hosted pilot entry point; refuses incomplete or live-study configuration."""
import os
from datetime import date
from pathlib import Path

from dotenv import load_dotenv

from study.config import ROOT, Settings


def validate_hosted_pilot(settings):
    if settings.mode != "pilot":
        raise ValueError("Hosted pilot must use pilot mode")
    if settings.llm_provider != "gemini" or not settings.api_key:
        raise ValueError("Hosted pilot requires the configured Gemini key")
    if len(settings.admin_token) < 32:
        raise ValueError("Hosted pilot requires a strong admin token")
    if settings.llm_daily_limit <= 0:
        raise ValueError("Hosted pilot requires a positive daily provider limit")
    if settings.consent_version != "pilot-consent-20261103":
        raise ValueError("Hosted pilot requires the current consent version")
    try:
        until = date.fromisoformat(settings.retention_until)
    except ValueError:
        raise ValueError("Confirm SCENTSELF_RETENTION_UNTIL as YYYY-MM-DD before launch") from None
    if until <= date.today():
        raise ValueError("Pilot retention date must be in the future")
    if not os.getenv("SCENTSELF_DATA_DIR") or not settings.data_dir.is_absolute():
        raise ValueError("Hosted pilot requires an explicit absolute data directory")
    if settings.data_dir.resolve() == (ROOT / "study_data").resolve():
        raise ValueError("Hosted pilot must use a separate data directory")


def create_app():
    load_dotenv(Path(__file__).resolve().parent / ".env")
    settings = Settings.from_env()
    validate_hosted_pilot(settings)
    from main_v3 import create_app as create_v3_app
    return create_v3_app(settings)
