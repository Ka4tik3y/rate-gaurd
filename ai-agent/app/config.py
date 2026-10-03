"""Agent configuration, environment-overridable."""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AGENT_", env_file=".env", extra="ignore")

    # Java rate-limiter / policy-gate API
    gateway_base_url: str = "http://localhost:8080"
    gateway_username: str = "agent"
    gateway_password: str = "agent"
    request_timeout_seconds: float = 10.0

    # LLM provider: "auto" uses Anthropic if its key is set, else Gemini if its key is set, else the
    # deterministic heuristic planner. "anthropic" / "gemini" / "heuristic" force one.
    llm_provider: str = "auto"
    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-opus-5-5"
    llm_max_tokens: int = 1024

    # Google Gemini (AI Studio / Generative Language API key).
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-3.5-flash"
    # Tried in order when the primary model is overloaded (429/5xx) or unavailable.
    gemini_fallback_models: list[str] = ["gemini-3.8-flash", "gemini-flash-latest"]
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta"
    gemini_timeout_seconds: float = 30.0
    # Passes over the model list when every model is overloaded, with a pause between passes.
    gemini_passes: int = 2
    gemini_retry_pause_seconds: float = 2.0

    # Guardrails the agent applies to its OWN proposals before the gate even sees them. These mirror
    # the server-side Policy Gate so proposals stay within bounds (defense in depth).
    max_change_ratio: float = 0.5
    max_block_seconds: int = 600
    min_confidence: float = 0.5

    # Closed-loop outcome verification
    outcome_wait_seconds: float = 10.0
    evaluation_window_minutes: int = 5

    # Autopilot: poll the detector's anomalies and investigate them without a manual trigger.
    auto_investigate: bool = True
    auto_poll_interval_seconds: float = 15.0
    # Don't re-investigate the same client more often than this (the gate has its own cooldown too).
    auto_cooldown_seconds: float = 120.0
    auto_history_size: int = 50

    def resolved_provider(self) -> str:
        if self.llm_provider == "auto":
            if self.anthropic_api_key:
                return "anthropic"
            return "gemini" if self.gemini_api_key else "heuristic"
        return self.llm_provider


settings = Settings()
