"""Google Gemini planner.

Calls the Generative Language API's ``generateContent`` with the shared operator prompt, the full
evidence payload (all metric windows, baseline, policy + guardrail state, recent action history) and
a JSON response schema, so the model returns a structured decision plus a human-readable summary.

Safety contract (same spirit as spec §24):
* Malformed or out-of-schema output is never acted on -> NONE.
* If Gemini is unreachable / overloaded on every configured model, the agent falls back to the
  deterministic heuristic playbook and labels the decision as such, so autonomous protection keeps
  working during an LLM outage. Whatever is chosen still goes through the Policy Gate.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from app.agent.llm import (
    _SYSTEM_PROMPT,
    HeuristicPlanner,
    Planner,
    build_user_payload,
    parse_decision,
)
from app.config import Settings
from app.models.schemas import AnomalyEvent, PlannerDecision

log = logging.getLogger(__name__)

# Statuses worth trying the next model for: rate limit, overload, transient server errors, and a
# model that is not available to this key.
_RETRYABLE = {404, 429, 500, 502, 503, 504}

_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "OBJECT",
    "properties": {
        "cause": {"type": "STRING"},
        "action_type": {"type": "STRING", "enum": ["ADJUST_LIMIT", "TEMPORARY_BLOCK", "ALERT", "NONE"]},
        "new_capacity": {"type": "INTEGER", "nullable": True},
        "new_refill_rate": {"type": "NUMBER", "nullable": True},
        "block_seconds": {"type": "INTEGER", "nullable": True},
        "alert_message": {"type": "STRING", "nullable": True},
        "rationale": {"type": "STRING"},
        "confidence": {"type": "NUMBER"},
        "summary": {"type": "STRING"},
        "evidence": {"type": "ARRAY", "items": {"type": "STRING"}},
    },
    "required": ["cause", "action_type", "rationale", "confidence", "summary", "evidence"],
}


class GeminiUnavailable(Exception):
    """Every configured Gemini model failed with a transport or retryable error."""


class GeminiPlanner(Planner):
    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None):
        self._s = settings
        self._system = _SYSTEM_PROMPT.format(
            ratio=settings.max_change_ratio, maxblock=settings.max_block_seconds)
        self._fallback = HeuristicPlanner(settings)
        self._transport = transport  # injectable for tests

    def _models(self) -> list[str]:
        seen: list[str] = []
        for m in [self._s.gemini_model, *self._s.gemini_fallback_models]:
            if m and m not in seen:
                seen.append(m)
        return seen

    async def plan(self, anomaly: AnomalyEvent, metrics: dict[str, Any],
                   policy: dict[str, Any], context: dict[str, Any] | None = None) -> PlannerDecision:
        payload = build_user_payload(anomaly, metrics, policy, context)
        try:
            model, raw = await self._generate(payload)
        except GeminiUnavailable as e:
            log.warning("Gemini unavailable, using the heuristic playbook: %s", e)
            d = await self._fallback.plan(anomaly, metrics, policy, context)
            d.planner = "heuristic (Gemini unavailable)"
            d.summary = f"Gemini could not be reached ({e}); decided by the rule-based playbook. {d.summary}"
            return d

        try:
            d = parse_decision(raw)
        except Exception as e:  # untrusted output is never acted on
            log.warning("Gemini returned unusable output, taking no action: %s", e)
            return PlannerDecision(
                cause="llm_output_invalid", action_type="NONE", confidence=0.0,
                rationale="Gemini's response could not be parsed; no automated action taken.",
                summary="The model's answer was not valid structured output, so nothing was changed.",
                planner=f"gemini:{model}")
        d.planner = f"gemini:{model}"
        return d

    async def _generate(self, user_payload: str) -> tuple[str, str]:
        body = {
            "systemInstruction": {"parts": [{"text": self._system}]},
            "contents": [{"role": "user", "parts": [{"text": user_payload}]}],
            "generationConfig": {
                "temperature": 0.4,
                "maxOutputTokens": 4096,
                "responseMimeType": "application/json",
                "responseSchema": _RESPONSE_SCHEMA,
            },
        }
        errors: list[str] = []
        async with httpx.AsyncClient(timeout=self._s.gemini_timeout_seconds, transport=self._transport) as http:
            # Overload (503) on Gemini is usually brief: try every model, pause, then try them once more.
            for attempt in range(self._s.gemini_passes):
                if attempt:
                    await asyncio.sleep(self._s.gemini_retry_pause_seconds)
                result = await self._try_models(http, body, errors)
                if result:
                    return result
        raise GeminiUnavailable("; ".join(errors) or "no models configured")

    async def _try_models(self, http: httpx.AsyncClient, body: dict[str, Any],
                          errors: list[str]) -> tuple[str, str] | None:
        for model in self._models():
            url = f"{self._s.gemini_base_url}/models/{model}:generateContent"
            try:
                r = await http.post(url, json=body, headers={"x-goog-api-key": self._s.gemini_api_key or ""})
            except httpx.HTTPError as e:
                errors.append(f"{model}: {type(e).__name__}")
                continue
            if r.status_code in _RETRYABLE:
                errors.append(f"{model}: HTTP {r.status_code}")
                continue
            if r.status_code >= 400:
                # Auth / bad request: no other model will fare better.
                raise GeminiUnavailable(f"{model}: HTTP {r.status_code}")
            text = _candidate_text(r.json())
            if text is None:
                errors.append(f"{model}: empty response")
                continue
            return model, text
        return None


def _candidate_text(data: dict[str, Any]) -> str | None:
    """Concatenated text of the first candidate, skipping thought parts; None if absent."""
    for cand in data.get("candidates") or []:
        parts = (cand.get("content") or {}).get("parts") or []
        text = "".join(p.get("text", "") for p in parts if not p.get("thought"))
        if text.strip():
            return text
    return None
