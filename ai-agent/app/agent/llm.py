"""LLM provider abstraction for the agent's reasoning step.

Two providers implement the same `plan()` interface:

* HeuristicPlanner  — deterministic operational rules. The default when no API key is configured,
  so the whole agent runs and is testable without any LLM. It is cheap and never fails.
* AnthropicPlanner  — uses Claude via the official SDK. On any error or malformed output it returns
  a safe NONE decision, so an LLM failure never causes a policy change (spec §24).

Only the reasoning (cause + candidate action) uses the LLM. Everything else — metrics, simulation,
the Policy Gate, outcome verification — is deterministic.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from app.config import Settings
from app.models.schemas import AnomalyEvent, PlannerDecision

log = logging.getLogger(__name__)

_ALLOWED = {"ADJUST_LIMIT", "TEMPORARY_BLOCK", "ALERT", "NONE"}


class Planner:
    async def plan(self, anomaly: AnomalyEvent, metrics: dict[str, Any],
                   policy: dict[str, Any]) -> PlannerDecision:  # pragma: no cover - interface
        raise NotImplementedError


class HeuristicPlanner(Planner):
    """Deterministic planner encoding the operational playbook."""

    def __init__(self, settings: Settings):
        self._s = settings

    async def plan(self, anomaly: AnomalyEvent, metrics: dict[str, Any],
                   policy: dict[str, Any]) -> PlannerDecision:
        cap = int(policy.get("capacity", 100))
        refill = float(policy.get("refillRate", 10))
        metric = anomaly.metric
        burst = float(metrics.get("burstiness", 0) or 0)
        reject = float(metrics.get("rejectedRatio", 0) or 0)
        err = float(metrics.get("errorRatio", 0) or 0)

        if metric == "error_ratio" or err >= 0.2:
            return PlannerDecision(
                cause="elevated 5xx error ratio — likely an upstream/service problem, not a client to throttle",
                action_type="ALERT",
                alert_message="Elevated 5xx errors for client; investigate the downstream service.",
                rationale="Errors are server-side; throttling the client would not help.",
                confidence=0.7,
            )

        if metric == "slow_and_low":
            return PlannerDecision(
                cause="low request rate but wide endpoint spread — endpoint enumeration/scanning",
                action_type="TEMPORARY_BLOCK",
                block_seconds=min(self._s.max_block_seconds, 600),
                rationale="Slow-and-low scanning evades rate limits; a temporary block contains it.",
                confidence=0.8,
            )

        if metric == "burstiness" or (burst >= 3 and reject >= 0.5):
            return PlannerDecision(
                cause="bursty traffic with high rejection — likely automated abuse",
                action_type="TEMPORARY_BLOCK",
                block_seconds=min(self._s.max_block_seconds, 300),
                rationale="Bursty, heavily-rejected traffic looks like a scraper/bot.",
                confidence=0.75,
            )

        if metric in ("reject_ratio", "request_rate"):
            if burst < 3:
                target = int(cap * (1 + self._s.max_change_ratio * 0.8))  # ~+40%
                return PlannerDecision(
                    cause="sustained 429s with steady (non-bursty) traffic — limit too tight for legitimate demand",
                    action_type="ADJUST_LIMIT",
                    new_capacity=target,
                    new_refill_rate=round(refill * (1 + self._s.max_change_ratio * 0.8), 3),
                    rationale="Raising the limit should cut false blocks of legitimate traffic.",
                    confidence=0.7,
                )
            return PlannerDecision(
                cause="request-rate spike with bursty, heavily-rejected traffic — likely abuse",
                action_type="TEMPORARY_BLOCK",
                block_seconds=min(self._s.max_block_seconds, 300),
                rationale="Spiky high-rejection traffic is more consistent with abuse than demand.",
                confidence=0.65,
            )

        return PlannerDecision(
            cause="anomaly observed but ambiguous",
            action_type="ALERT",
            alert_message=f"Anomaly on {metric}; no confident automated action.",
            rationale="Insufficient signal for an automated mutation; alerting instead.",
            confidence=0.5,
        )


_SYSTEM_PROMPT = """You are an autonomous API rate-limiting operations agent. You investigate a \
traffic anomaly for one client and decide on at most one safe action. You do not have direct access \
to any system; a separate Policy Gate validates and executes whatever you propose, and will reject \
anything unsafe.

Allowed actions:
- ADJUST_LIMIT: change the client's rate-limit capacity. Automatic changes are capped at ±{ratio:.0%} \
of the current capacity. Use this when legitimate traffic is being over-limited (high 429 ratio with \
steady, non-bursty traffic).
- TEMPORARY_BLOCK: block the client for a bounded number of seconds (max {maxblock}). Use for clear \
abuse: bursty high-rejection traffic, or slow-and-low endpoint scanning.
- ALERT: raise an alert only, no mutation. Use for server-side problems (high 5xx) or when evidence \
is ambiguous.
- NONE: do nothing.

Respond with ONLY a JSON object, no prose, with keys: cause (string), action_type (one of \
ADJUST_LIMIT, TEMPORARY_BLOCK, ALERT, NONE), new_capacity (int or null), new_refill_rate (number or \
null), block_seconds (int or null), alert_message (string or null), rationale (short string), \
confidence (0..1). Provide only a concise rationale, never step-by-step internal reasoning."""


class AnthropicPlanner(Planner):
    """Claude-backed planner. Falls back to a safe NONE decision on any failure (spec §24)."""

    def __init__(self, settings: Settings):
        self._s = settings
        self._system = _SYSTEM_PROMPT.format(
            ratio=settings.max_change_ratio, maxblock=settings.max_block_seconds)

    async def plan(self, anomaly: AnomalyEvent, metrics: dict[str, Any],
                   policy: dict[str, Any]) -> PlannerDecision:
        import asyncio

        try:
            from anthropic import Anthropic

            client = Anthropic(api_key=self._s.anthropic_api_key)
            user = json.dumps({
                "anomaly": anomaly.model_dump(),
                "recent_metrics": metrics,
                "current_policy": policy,
            })

            def _call() -> str:
                resp = client.messages.create(
                    model=self._s.anthropic_model,
                    max_tokens=self._s.llm_max_tokens,
                    system=self._system,
                    messages=[{"role": "user", "content": user}],
                )
                return "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")

            raw = await asyncio.to_thread(_call)
            return self._parse(raw)
        except Exception as e:  # LLM/transport/parse failure -> no action
            log.warning("LLM planning failed, defaulting to no action: %s", e)
            return PlannerDecision(
                cause="llm_unavailable",
                action_type="NONE",
                rationale="LLM planning failed; no automated action taken.",
                confidence=0.0,
            )

    @staticmethod
    def _parse(raw: str) -> PlannerDecision:
        text = raw.strip()
        if text.startswith("```"):
            text = text.split("```", 2)[1]
            if text.startswith("json"):
                text = text[4:]
        data = json.loads(text)
        action = str(data.get("action_type", "NONE")).upper()
        if action not in _ALLOWED:
            action = "NONE"
        return PlannerDecision(
            cause=str(data.get("cause", "")),
            action_type=action,
            new_capacity=data.get("new_capacity"),
            new_refill_rate=data.get("new_refill_rate"),
            block_seconds=data.get("block_seconds"),
            alert_message=data.get("alert_message"),
            rationale=str(data.get("rationale", "")),
            confidence=float(data.get("confidence", 0.0)),
        )


def get_planner(settings: Settings) -> Planner:
    provider = settings.resolved_provider()
    if provider == "anthropic":
        log.info("using Anthropic planner (model=%s)", settings.anthropic_model)
        return AnthropicPlanner(settings)
    log.info("using deterministic heuristic planner")
    return HeuristicPlanner(settings)
