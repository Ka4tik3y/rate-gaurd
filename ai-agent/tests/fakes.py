"""Test doubles: an in-memory gateway that records proposals and serves scripted metrics."""
from __future__ import annotations

from typing import Any


def window(reject: float, burst: float = 1.0, minutes: int = 5, requests: int = 1000,
           errors: float = 0.0, unique: int = 3) -> dict[str, Any]:
    return {
        "clientId": "c", "windowMinutes": minutes, "requests": requests,
        "rejected": int(requests * reject), "errors": int(requests * errors),
        "requestRatePerMinute": requests / minutes, "rejectedRatio": reject,
        "errorRatio": errors, "avgLatencyMillis": 5.0, "uniqueEndpoints": unique, "burstiness": burst,
    }


class FakeGateway:
    def __init__(self, policy: dict[str, Any], metrics_sequence: list[list[dict[str, Any]]],
                 propose_results: list[dict[str, Any]]):
        self.policy = policy
        self._metrics = metrics_sequence
        self._propose = propose_results
        self.proposals: list[dict[str, Any]] = []
        self._mcall = 0
        self._pcall = 0

    async def get_metrics(self, client_id: str) -> list[dict[str, Any]]:
        idx = min(self._mcall, len(self._metrics) - 1)
        self._mcall += 1
        return self._metrics[idx]

    async def get_policy(self, client_id: str) -> dict[str, Any]:
        return self.policy

    async def get_audit(self, client_id: str, limit: int = 20) -> list[dict[str, Any]]:
        return []

    async def simulate(self, client_id: str, capacity: int, refill_rate, window_minutes: int) -> dict[str, Any]:
        return {"observedRequests": 1000, "currentEstimatedAllowed": 100, "currentEstimatedRejected": 900,
                "simulatedAllowed": 140, "simulatedRejected": 860}

    async def propose_action(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.proposals.append(payload)
        idx = min(self._pcall, len(self._propose) - 1)
        self._pcall += 1
        return self._propose[idx]


APPROVED = {"decision": "APPROVED", "actionId": "a1", "reasons": ["applied"]}
REJECTED = {"decision": "REJECTED", "actionId": "a2", "reasons": ["kill switch engaged"]}
PENDING = {"decision": "PENDING_APPROVAL", "actionId": "a3", "reasons": ["high-value approval required"]}


def normal_policy(capacity: int = 100, refill: float = 10.0, classification: str = "NORMAL") -> dict[str, Any]:
    return {"clientId": "c", "policy": "default", "capacity": capacity, "refillRate": refill,
            "blocked": False, "blockTtlSeconds": -1, "classification": classification}
