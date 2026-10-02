"""Explicit agent tools (spec §28).

Read tools inspect state; mutation tools (`propose_*`, `send_alert`) submit to the Policy Gate via
the gateway's /agent/actions endpoint. No tool touches Redis or an admin endpoint directly.
"""
from __future__ import annotations

from typing import Any, Optional

from app.models.schemas import AnomalyEvent
from app.services.gateway import GatewayClient


class AgentTools:
    def __init__(self, gateway: GatewayClient):
        self._gw = gateway

    # ---- read tools ----
    async def get_client_metrics(self, client_id: str) -> list[dict[str, Any]]:
        """All configured windows (1/5/10m) of aggregated traffic metrics for a client."""
        return await self._gw.get_metrics(client_id)

    async def get_historical_metrics(self, client_id: str) -> dict[str, Any]:
        """The longest window acts as the client's recent historical baseline."""
        windows = await self._gw.get_metrics(client_id)
        return max(windows, key=lambda w: w.get("windowMinutes", 0)) if windows else {}

    async def get_current_policy(self, client_id: str) -> dict[str, Any]:
        """Effective rate-limit policy + block status + classification."""
        return await self._gw.get_policy(client_id)

    async def get_client_classification(self, client_id: str) -> str:
        policy = await self._gw.get_policy(client_id)
        return policy.get("classification", "NORMAL")

    async def get_action_history(self, client_id: str, limit: int = 20) -> list[dict[str, Any]]:
        return await self._gw.get_audit(client_id, limit)

    async def simulate_policy_change(self, client_id: str, capacity: int,
                                     refill_rate: Optional[float], window_minutes: int) -> dict[str, Any]:
        return await self._gw.simulate(client_id, capacity, refill_rate, window_minutes)

    # ---- mutation tools (all go through the Policy Gate) ----
    async def propose_rate_limit_change(self, client_id: str, new_capacity: int,
                                        new_refill_rate: Optional[float], trigger: str, reason: str,
                                        evidence: Optional[AnomalyEvent]) -> dict[str, Any]:
        payload = {
            "actionType": "ADJUST_LIMIT",
            "clientId": client_id,
            "newCapacity": new_capacity,
            "newRefillRate": new_refill_rate,
            "trigger": trigger,
            "reason": reason,
            "evidence": _evidence(evidence),
        }
        return await self._gw.propose_action(payload)

    async def propose_temporary_block(self, client_id: str, seconds: int, trigger: str,
                                      reason: str, evidence: Optional[AnomalyEvent]) -> dict[str, Any]:
        payload = {
            "actionType": "TEMPORARY_BLOCK",
            "clientId": client_id,
            "blockSeconds": seconds,
            "trigger": trigger,
            "reason": reason,
            "evidence": _evidence(evidence),
        }
        return await self._gw.propose_action(payload)

    async def send_alert(self, client_id: str, message: str, trigger: str, reason: str,
                         evidence: Optional[AnomalyEvent]) -> dict[str, Any]:
        payload = {
            "actionType": "ALERT",
            "clientId": client_id,
            "alertMessage": message,
            "trigger": trigger,
            "reason": reason,
            "evidence": _evidence(evidence),
        }
        return await self._gw.propose_action(payload)


def _evidence(anomaly: Optional[AnomalyEvent]) -> Optional[dict[str, Any]]:
    if anomaly is None:
        return None
    return {
        "metric": anomaly.metric,
        "currentValue": anomaly.currentValue,
        "baseline": anomaly.baseline,
        "deviation": anomaly.deviation,
        "severity": anomaly.severity,
        "window": anomaly.window,
    }
