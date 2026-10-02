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

    # LLM provider: "auto" uses Anthropic when an API key is present, else the deterministic
    # heuristic planner. "anthropic" forces the LLM; "heuristic" forces the deterministic planner.
    llm_provider: str = "auto"
    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-opus-5-5"
    llm_max_tokens: int = 1024

    # Guardrails the agent applies to its OWN proposals before the gate even sees them. These mirror
    # the server-side Policy Gate so proposals stay within bounds (defense in depth).
    max_change_ratio: float = 0.5
    max_block_seconds: int = 600
    min_confidence: float = 0.5

    # Closed-loop outcome verification
    outcome_wait_seconds: float = 10.0
    evaluation_window_minutes: int = 5

    def resolved_provider(self) -> str:
        if self.llm_provider == "auto":
            return "anthropic" if self.anthropic_api_key else "heuristic"
        return self.llm_provider


settings = Settings()
