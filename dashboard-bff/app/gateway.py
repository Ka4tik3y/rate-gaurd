"""Thin async client for the real gateway (Java) and agent (Python).

All admin calls carry HTTP Basic credentials injected here, server-side, so they never reach the
browser. This module is the ONLY thing that talks to the internal services.
"""
from __future__ import annotations

from typing import Any

import httpx

from app.config import settings


class Gateway:
    def __init__(self) -> None:
        self._http = httpx.AsyncClient(timeout=settings.request_timeout_seconds)
        self._auth = (settings.admin_username, settings.admin_password)

    async def aclose(self) -> None:
        await self._http.aclose()

    # ---- gateway admin (authenticated) ----
    async def get_admin(self, path: str) -> Any:
        r = await self._http.get(f"{settings.gateway_base_url}{path}", auth=self._auth)
        r.raise_for_status()
        return r.json()

    async def post_admin(self, path: str, json: Any | None = None) -> Any:
        r = await self._http.post(f"{settings.gateway_base_url}{path}", auth=self._auth, json=json)
        r.raise_for_status()
        return _maybe_json(r)

    async def put_admin(self, path: str, json: Any | None = None) -> Any:
        r = await self._http.put(f"{settings.gateway_base_url}{path}", auth=self._auth, json=json)
        r.raise_for_status()
        return _maybe_json(r)

    # ---- unauthenticated gateway surface ----
    async def hit_api(self, path: str, client_id: str) -> int:
        """Send one request through the rate limiter as a given client; return the status code."""
        try:
            r = await self._http.get(f"{settings.gateway_base_url}{path}", headers={"X-Forwarded-For": client_id})
            return r.status_code
        except Exception:
            return 0

    async def prometheus(self) -> dict[str, float]:
        r = await self._http.get(f"{settings.gateway_base_url}/actuator/prometheus")
        totals = {"requests": 0.0, "allowed": 0.0, "rejected": 0.0, "errors": 0.0}
        key = {
            "rate_limit_requests_total": "requests",
            "rate_limit_allowed_total": "allowed",
            "rate_limit_rejected_total": "rejected",
            "rate_limit_redis_errors_total": "errors",
        }
        for line in r.text.splitlines():
            if not line or line[0] == "#":
                continue
            name = line.split("{", 1)[0].split(" ", 1)[0]
            tgt = key.get(name)
            if tgt:
                try:
                    totals[tgt] += float(line.rsplit(" ", 1)[1])
                except (ValueError, IndexError):
                    pass
        return totals

    async def gateway_health(self) -> bool:
        try:
            r = await self._http.get(f"{settings.gateway_base_url}/actuator/health")
            return r.status_code == 200
        except Exception:
            return False

    # ---- agent ----
    async def agent_health(self) -> dict[str, Any] | None:
        try:
            r = await self._http.get(f"{settings.agent_base_url}/health")
            return r.json() if r.status_code == 200 else None
        except Exception:
            return None

    async def agent_auto_investigations(self) -> list[dict[str, Any]]:
        """Investigations the agent's autopilot ran on its own (newest first)."""
        r = await self._http.get(f"{settings.agent_base_url}/investigations")
        r.raise_for_status()
        return r.json()

    async def agent_investigate(self, payload: dict[str, Any]) -> dict[str, Any]:
        r = await self._http.post(f"{settings.agent_base_url}/anomalies", json=payload)
        r.raise_for_status()
        return r.json()


def _maybe_json(r: httpx.Response) -> Any:
    try:
        return r.json()
    except Exception:
        return {"raw": r.text[:300]}
