import os
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    mode: str = "pilot"
    llm_provider: str = "none"
    llm_model: str = "gemini-3.5-flash-lite"
    api_key: str = ""
    admin_token: str = ""
    contact: str = ""
    retention_until: str = ""
    llm_daily_limit: int = 0
    database_url: str = field(default="", repr=False)
    live_confirmed: bool = False
    protocol: str = "prepost-v1-20261028-pilot-integration-20261031"
    consent_version: str = "pilot-consent-20261031"
    ui_version: str = "advisor-chat-v2-20261031"

    @classmethod
    def from_env(cls):
        mode = os.getenv("SCENTSELF_STUDY_MODE", "pilot")
        if mode not in {"pilot", "live"}:
            raise ValueError("SCENTSELF_STUDY_MODE must be pilot or live")
        settings = cls(
            data_dir=Path(os.getenv("SCENTSELF_DATA_DIR", str(ROOT / "study_data"))),
            mode=mode,
            llm_provider=os.getenv("SCENTSELF_LLM_PROVIDER", "gemini"),
            llm_model=os.getenv("SCENTSELF_GEMINI_MODEL", "gemini-3.5-flash-lite"),
            api_key=os.getenv("GEMINI_API_KEY", ""),
            admin_token=os.getenv("SCENTSELF_ADMIN_TOKEN", ""),
            contact=os.getenv("SCENTSELF_RESEARCH_CONTACT", ""),
            retention_until=os.getenv("SCENTSELF_RETENTION_UNTIL", ""),
            llm_daily_limit=int(os.getenv("SCENTSELF_LLM_DAILY_LIMIT", "0")),
            database_url=os.getenv("SCENTSELF_DATABASE_URL", ""),
            live_confirmed=os.getenv("SCENTSELF_LIVE_CONFIRMED", "") == "yes",
            consent_version=os.getenv("SCENTSELF_CONSENT_VERSION", "pilot-consent-20261031" if mode == "pilot" else ""),
        )
        if settings.llm_provider not in {"gemini", "none"}:
            raise ValueError("SCENTSELF_LLM_PROVIDER must be gemini or none")
        if settings.llm_daily_limit < 0:
            raise ValueError("SCENTSELF_LLM_DAILY_LIMIT must not be negative")
        if mode == "live" and not (settings.live_confirmed and settings.contact and settings.admin_token):
            raise ValueError("Live collection requires confirmation, researcher contact and an admin token")
        if mode == "live" and settings.llm_provider == "gemini" and not settings.api_key:
            raise ValueError("The selected live LLM provider has no API key")
        if mode == "live" and (not settings.consent_version or settings.consent_version.startswith("pilot")):
            raise ValueError("Live collection requires a reviewed non-pilot consent version")
        return settings
