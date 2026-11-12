"""Settings from the environment. Secrets are read here and never logged."""

from __future__ import annotations

import os
from dataclasses import dataclass, field

# Must match src/lib/v2/types.ts.
VOICE_AGENT_NAME = "venturepath-interviewer"
VOICE_AGENT_SECRET_HEADER = "x-voice-agent-secret"


def load_env_file() -> None:
    """Load VOICE_AGENT_ENV_FILE (e.g. the app's ../.env) without overriding real env vars."""
    path = os.environ.get("VOICE_AGENT_ENV_FILE", "").strip()
    if path:
        from dotenv import load_dotenv

        load_dotenv(path, override=False)


def _float(name: str, default: float) -> float:
    raw = os.environ.get(name, "").strip()
    return float(raw) if raw else default


@dataclass(frozen=True)
class Settings:
    app_url: str
    shared_secret: str = field(repr=False)
    live_model: str
    #: Gemini API version for the Live WebSocket. Verified 2026-11-12: this key's Live endpoint
    #: answers 404 on the SDK default (v1beta) and connects on v1alpha.
    live_api_version: str
    voice: str
    max_session_sec: float
    flush_interval_sec: float
    #: Seconds to wait for the model to say goodbye after the last question before closing.
    end_grace_sec: float

    def missing(self) -> list[str]:
        """Names of required variables that are not set (values are never returned)."""
        required = {
            "VOICE_AGENT_APP_URL": self.app_url,
            "VOICE_AGENT_SHARED_SECRET": self.shared_secret,
            "GOOGLE_API_KEY": os.environ.get("GOOGLE_API_KEY", ""),
            "LIVEKIT_URL": os.environ.get("LIVEKIT_URL", ""),
            "LIVEKIT_API_KEY": os.environ.get("LIVEKIT_API_KEY", ""),
            "LIVEKIT_API_SECRET": os.environ.get("LIVEKIT_API_SECRET", ""),
        }
        return [name for name, value in required.items() if not value]


def load_settings() -> Settings:
    return Settings(
        app_url=os.environ.get("VOICE_AGENT_APP_URL", "http://localhost:3000").rstrip("/"),
        shared_secret=os.environ.get("VOICE_AGENT_SHARED_SECRET", ""),
        live_model=os.environ.get("VOICE_LIVE_MODEL", "gemini-3.8-live"),
        live_api_version=os.environ.get("VOICE_LIVE_API_VERSION", "v1alpha"),
        voice=os.environ.get("VOICE_LIVE_VOICE", "Puck"),
        max_session_sec=_float("VOICE_MAX_SESSION_SEC", 25 * 60),
        flush_interval_sec=_float("VOICE_FLUSH_INTERVAL_SEC", 15),
        end_grace_sec=_float("VOICE_END_GRACE_SEC", 45),
    )
