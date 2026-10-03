"""HTTP client for the Java rate-limiter / Policy Gate API.

This is the agent's ONLY connection to production state. It talks exclusively to the AGENT-role
HTTP endpoints — it never touches Redis and never calls an admin mutation endpoint. All mutations go
through POST /agent/actions, which the server funnels into the Policy Gate (architectural rules 2-4).
"""
from __future__ import annotations

from typing import Any

import httpx

from app.config import Settings


class GatewayError(RuntimeError):
    """Raised when the gateway API cannot be reached or returns an error status."""


class GatewayClient:
    def __init__(self, settings: Settings):
        self._settings = settings
        self._client = httpx.AsyncClient(
            base_url=settings.gateway_base_url,
            auth=(settings.gateway_username, settings.gateway_password),
            timeout=settings.request_timeout_seconds,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _get(self, path: str) -> Any:
        try:
            r = await self._client.get(path)
            r.raise_for_status()
            return r.json()
        except httpx.HTTPError as e:  # pragma: no cover - exercised via workflow error path
            raise GatewayError(f"GET {path} failed: {e}") from e

    async def _post(self, path: str, json: dict[str, Any]) -> Any:
        try:
            r = await self._client.post(path, json=json)
            r.raise_for_status()
            return r.json()
        except httpx.HTTPError as e:  # pragma: no cover
            raise GatewayError(f"POST {path} failed: {e}") from e

    # ---- reads ----
    async def get_anomalies(self) -> list[dict[str, Any]]:
        """Recent detector anomalies, newest first (the autopilot's input)."""
        return await self._get("/agent/anomalies")

    async def get_metrics(self, client_id: str) -> list[dict[str, Any]]:
        return await self._get(f"/agent/metrics/{client_id}")

    async def get_policy(self, client_id: str) -> dict[str, Any]:
        return await self._get(f"/agent/policy/{client_id}")

    async def get_audit(self, client_id: str, limit: int = 20) -> list[dict[str, Any]]:
        return await self._get(f"/agent/audit/{client_id}?limit={limit}")

    async def simulate(self, client_id: str, capacity: int, refill_rate: float | None,
                       window_minutes: int) -> dict[str, Any]:
        body: dict[str, Any] = {"capacity": capacity, "windowMinutes": window_minutes}
        if refill_rate is not None:
            body["refillRate"] = refill_rate
        return await self._post(f"/agent/simulate/{client_id}", body)

    # ---- the single gated mutation path ----
    async def propose_action(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._post("/agent/actions", payload)
