"""LLM provider abstraction for the agent's reasoning step.

Three providers implement the same `plan()` interface:

* HeuristicPlanner  — deterministic operational rules. The default when no API key is configured,
  so the whole agent runs and is testable without any LLM. It is cheap and never fails.
* AnthropicPlanner  — uses Claude via the official SDK. On any error or malformed output it returns
  a safe NONE decision, so an LLM failure never causes a policy change (spec §24).
* GeminiPlanner     — uses Google Gemini (app/agent/gemini.py). Same contract: malformed output is
  never acted on; if Gemini is unreachable it falls back to the heuristic playbook, labelled as such.

The LLM planners get far more than the anomaly: every metric window, the client's baseline, its
current policy and guardrail state, and its recent action history — so they can reason about
context (e.g. "we already raised this limit and it is still flooding") and write an investigation
summary for the on-call human.

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
                   policy: dict[str, Any],
                   context: dict[str, Any] | None = None) -> PlannerDecision:  # pragma: no cover - interface
        """Decide on one action. ``context`` carries the extra evidence the LLM planners use:
        ``metric_windows`` (all windows), ``baseline`` and ``recent_actions`` (audit history)."""
        raise NotImplementedError


def build_user_payload(anomaly: AnomalyEvent, metrics: dict[str, Any], policy: dict[str, Any],
                       context: dict[str, Any] | None) -> str:
    """The evidence handed to an LLM planner, as compact JSON."""
    ctx = context or {}
    return json.dumps({
        "anomaly": anomaly.model_dump(),
        "evaluation_window_metrics": metrics,
        "all_metric_windows": ctx.get("metric_windows", []),
        "baseline_longest_window": ctx.get("baseline", {}),
        "current_policy": policy,
        "recent_actions_newest_first": ctx.get("recent_actions", []),
    }, default=str)


class HeuristicPlanner(Planner):
    """Deterministic planner encoding the operational playbook."""

    def __init__(self, settings: Settings):
        self._s = settings

    async def plan(self, anomaly: AnomalyEvent, metrics: dict[str, Any],
                   policy: dict[str, Any], context: dict[str, Any] | None = None) -> PlannerDecision:
        d = self._decide(anomaly, metrics, policy)
        d.planner = "heuristic"
        if not d.summary:
            d.summary = f"Rule-based playbook: {d.cause}. {d.rationale}"
        return d

    def _decide(self, anomaly: AnomalyEvent, metrics: dict[str, Any],
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
            # A client blocked recently is a repeat offender, not under-served demand: never reward
            # it with more capacity (the Policy Gate would refuse the increase anyway).
            if policy.get("recentlyBlocked"):
                return PlannerDecision(
                    cause="heavy over-limit traffic from a client that was recently blocked — repeat abuse",
                    action_type="TEMPORARY_BLOCK",
                    block_seconds=min(self._s.max_block_seconds, 300),
                    rationale="The client was blocked recently and is flooding again; block rather than raise its limit.",
                    confidence=0.8,
                )
            if burst < 3:
                target = int(cap * (1 + self._s.max_change_ratio * 0.8))  # ~+40%
                ceiling = policy.get("agentMaxCapacity")
                if ceiling:
                    target = min(target, int(ceiling))
                if target <= cap:
                    return PlannerDecision(
                        cause="sustained 429s, but the limit is already at the agent's ceiling",
                        action_type="ALERT",
                        alert_message=(f"Client at the agent's capacity ceiling ({cap}) and still over-limited; "
                                       "an admin should decide whether it deserves more."),
                        rationale="Raising further needs a human decision.",
                        confidence=0.6,
                    )
                return PlannerDecision(
                    cause="sustained 429s with steady (non-bursty) traffic — limit too tight for legitimate demand",
                    action_type="ADJUST_LIMIT",
                    new_capacity=target,
                    new_refill_rate=round(refill * target / cap, 3) if cap else refill,
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


_SYSTEM_PROMPT = """You are the on-call AI operator for an API rate limiter. A deterministic detector \
flagged a traffic anomaly for one client. Investigate the evidence and decide on at most ONE safe \
action. You cannot touch any system yourself: a separate Policy Gate validates whatever you propose \
and rejects anything outside its guardrails.

How to read the evidence:
- Metric windows (1m, 5m, 10m...): requests, rejected (429s), errors (5xx), requestRatePerMinute, \
rejectedRatio, errorRatio, avgLatencyMillis, uniqueEndpoints, burstiness (peak minute / mean minute; \
1.0 = perfectly even, >= 3 = spiky). Compare short vs long windows to tell a spike from a trend.
- baseline_longest_window is the client's recent normal.
- current_policy: capacity / refillRate (tokens, tokens per second), blocked, recentlyBlocked (blocked \
in the last 30 min, even if since unblocked), overrideTtlSeconds, agentMaxCapacity (the highest you \
may raise a limit to), classification (HIGH_VALUE blocks need a human).
- recent_actions_newest_first: what was already done to this client and whether the gate approved \
it. Use it: a client whose limit was already raised and is still over-limited, or that was blocked \
and came straight back, is not under-served demand.

Allowed actions:
- ADJUST_LIMIT: new_capacity and new_refill_rate. At most ±{ratio:.0%} of the current capacity per \
change, never above agentMaxCapacity, never raised for a recentlyBlocked client. Agent limits expire \
on their own. Use for legitimate demand that is over-limited (steady traffic, many 429s), or to \
lower a limit that is clearly far above real usage.
- TEMPORARY_BLOCK: block_seconds, max {maxblock}. Use for abuse: bursty heavily-rejected traffic, \
endpoint scanning (many uniqueEndpoints at a low rate), or a repeat offender.
- ALERT: alert_message only, no change. Use for server-side trouble (5xx), for a client already at \
agentMaxCapacity that may deserve more (a human decides), or when evidence is ambiguous.
- NONE: nothing worth doing (e.g. the anomaly already subsided).

Write for the engineer on call:
- summary: 2-4 plain sentences on what is happening, why you think so, and what you propose — cite \
the specific numbers that matter. Say "propose"/"recommend", never "applied": the Policy Gate decides \
afterwards. No boilerplate, no restating these instructions.
- evidence: 2-5 short bullet strings, each one concrete observation with its number.
- cause: one short phrase. rationale: one sentence on why this action over the alternatives.
- confidence: 0..1, honest — lower it when signals conflict.
Never include step-by-step internal reasoning."""



class AnthropicPlanner(Planner):
    """Claude-backed planner. Falls back to a safe NONE decision on any failure (spec §24)."""

    def __init__(self, settings: Settings):
        self._s = settings
        self._system = _SYSTEM_PROMPT.format(
            ratio=settings.max_change_ratio, maxblock=settings.max_block_seconds)

    async def plan(self, anomaly: AnomalyEvent, metrics: dict[str, Any],
                   policy: dict[str, Any], context: dict[str, Any] | None = None) -> PlannerDecision:
        import asyncio

        try:
            from anthropic import Anthropic

            client = Anthropic(api_key=self._s.anthropic_api_key)
            user = build_user_payload(anomaly, metrics, policy, context) + (
                "\n\nRespond with ONLY a JSON object with keys: cause, action_type, new_capacity, "
                "new_refill_rate, block_seconds, alert_message, rationale, confidence, summary, evidence.")

            def _call() -> str:
                resp = client.messages.create(
                    model=self._s.anthropic_model,
                    max_tokens=self._s.llm_max_tokens,
                    system=self._system,
                    messages=[{"role": "user", "content": user}],
                )
                return "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")

            raw = await asyncio.to_thread(_call)
            d = parse_decision(raw)
            d.planner = f"anthropic:{self._s.anthropic_model}"
            return d
        except Exception as e:  # LLM/transport/parse failure -> no action
            log.warning("LLM planning failed, defaulting to no action: %s", e)
            return PlannerDecision(
                cause="llm_unavailable",
                action_type="NONE",
                rationale="LLM planning failed; no automated action taken.",
                confidence=0.0,
                planner=f"anthropic:{self._s.anthropic_model}",
                summary="The LLM could not be reached or returned unusable output, so no change was made.",
            )


def parse_decision(raw: str) -> PlannerDecision:
    """Parse an LLM's JSON decision. Unknown actions become NONE; raises on malformed JSON."""
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1]
        if text.startswith("json"):
            text = text[4:]
    data = json.loads(text)
    action = str(data.get("action_type", "NONE")).upper()
    if action not in _ALLOWED:
        action = "NONE"
    evidence = data.get("evidence") or []
    return PlannerDecision(
        cause=str(data.get("cause", "")),
        action_type=action,
        new_capacity=data.get("new_capacity"),
        new_refill_rate=data.get("new_refill_rate"),
        block_seconds=data.get("block_seconds"),
        alert_message=data.get("alert_message"),
        rationale=str(data.get("rationale", "")),
        confidence=max(0.0, min(1.0, float(data.get("confidence", 0.0) or 0.0))),
        summary=str(data.get("summary", "") or ""),
        evidence=[str(e) for e in evidence][:6] if isinstance(evidence, list) else [],
    )


def get_planner(settings: Settings) -> Planner:
    provider = settings.resolved_provider()
    if provider == "anthropic":
        log.info("using Anthropic planner (model=%s)", settings.anthropic_model)
        return AnthropicPlanner(settings)
    if provider == "gemini":
        from app.agent.gemini import GeminiPlanner

        log.info("using Gemini planner (model=%s)", settings.gemini_model)
        return GeminiPlanner(settings)
    log.info("using deterministic heuristic planner")
    return HeuristicPlanner(settings)
