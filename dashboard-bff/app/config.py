"""BFF configuration (env-overridable, prefix BFF_)."""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="BFF_", env_file=".env", extra="ignore")

    # Internal services (Docker network). Never exposed publicly — only this BFF is.
    gateway_base_url: str = "http://localhost:8080"
    agent_base_url: str = "http://localhost:8000"

    # Admin credentials, injected server-side only (never sent to the browser).
    admin_username: str = "admin"
    admin_password: str = "admin"

    request_timeout_seconds: float = 20.0

    # The gateway's default per-client capacity (shown next to custom limits).
    default_capacity: int = 100

    # Prometheus sampler cadence + history retained for the traffic chart.
    poll_interval_seconds: float = 3.0
    series_points: int = 240

    # Public-demo guardrails for the traffic generator.
    max_traffic_requests: int = 500
    max_traffic_concurrency: int = 25

    # Where the built React app is served from.
    web_dir: str = "webdist"
    # Bundled evaluation results (copied from evaluation/results/results.json at build).
    evaluation_file: str = "evaluation_results.json"


settings = Settings()
