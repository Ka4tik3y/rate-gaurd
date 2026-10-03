"""Gemini planner: request shape, parsing, model fallback, and failure behaviour (no network)."""
from __future__ import annotations

import json

import httpx

from app.agent.gemini import GeminiPlanner
from app.agent.llm import get_planner
from app.config import Settings
from app.models.schemas import AnomalyEvent
from tests.fakes import normal_policy, window

S = Settings(llm_provider="gemini", gemini_api_key="test-key", gemini_model="m-primary",
             gemini_fallback_models=["m-backup"], gemini_retry_pause_seconds=0)
ANOMALY = AnomalyEvent(clientId="c", metric="reject_ratio", deviation=4.0, severity="HIGH", window="5m")
CONTEXT = {"metric_windows": [window(reject=0.6, burst=1.2)], "baseline": window(reject=0.05, burst=1.0),
           "recent_actions": [{"source": "AGENT", "actionType": "TEMPORARY_BLOCK", "decision": "APPROVED"}]}

DECISION = {
    "cause": "repeat abuse after an early unblock",
    "action_type": "TEMPORARY_BLOCK", "block_seconds": 300,
    "rationale": "It was blocked minutes ago and resumed at 3x its baseline.",
    "confidence": 0.82,
    "summary": "c came back right after its block was lifted and is sending 3x its normal rate.",
    "evidence": ["rejectedRatio 0.60 vs baseline 0.05", "blocked 4 min ago"],
}


def gemini_reply(obj: dict) -> httpx.Response:
    return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": json.dumps(obj)}]}}]})


def transport(handler) -> httpx.MockTransport:
    return httpx.MockTransport(handler)


async def test_structured_decision_with_summary_and_full_context():
    seen = {}

    def handler(req: httpx.Request) -> httpx.Response:
        seen["url"] = str(req.url)
        seen["key"] = req.headers.get("x-goog-api-key")
        seen["body"] = json.loads(req.content)
        return gemini_reply(DECISION)

    d = await GeminiPlanner(S, transport(handler)).plan(ANOMALY, window(reject=0.6), normal_policy(), CONTEXT)

    assert d.action_type == "TEMPORARY_BLOCK" and d.block_seconds == 300
    assert d.summary.startswith("c came back") and len(d.evidence) == 2
    assert d.planner == "gemini:m-primary"
    assert seen["url"].endswith("/models/m-primary:generateContent")
    assert seen["key"] == "test-key"
    cfg = seen["body"]["generationConfig"]
    assert cfg["responseMimeType"] == "application/json" and "summary" in cfg["responseSchema"]["properties"]
    # The model sees history and every window, not just the anomaly.
    user = json.loads(seen["body"]["contents"][0]["parts"][0]["text"])
    assert user["recent_actions_newest_first"][0]["actionType"] == "TEMPORARY_BLOCK"
    assert user["all_metric_windows"] and user["baseline_longest_window"]


async def test_overloaded_primary_falls_through_to_backup_model():
    calls = []

    def handler(req: httpx.Request) -> httpx.Response:
        calls.append(req.url.path)
        if "m-primary" in req.url.path:
            return httpx.Response(503, json={"error": {"message": "high demand"}})
        return gemini_reply(DECISION)

    d = await GeminiPlanner(S, transport(handler)).plan(ANOMALY, window(reject=0.6), normal_policy(), CONTEXT)
    assert d.planner == "gemini:m-backup"
    assert len(calls) == 2


async def test_brief_overload_recovers_on_the_second_pass():
    calls = []

    def handler(req: httpx.Request) -> httpx.Response:
        calls.append(req.url.path)
        return httpx.Response(503) if len(calls) <= 2 else gemini_reply(DECISION)

    d = await GeminiPlanner(S, transport(handler)).plan(ANOMALY, window(reject=0.6), normal_policy(), CONTEXT)
    assert d.planner == "gemini:m-primary" and len(calls) == 3


async def test_all_models_down_falls_back_to_heuristic_labelled():
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(503)

    d = await GeminiPlanner(S, transport(handler)).plan(
        ANOMALY, window(reject=0.6, burst=1.2), normal_policy(), CONTEXT)
    assert d.planner == "heuristic (Gemini unavailable)"
    assert d.action_type == "ADJUST_LIMIT"  # the rule-based answer for steady 429s
    assert "Gemini could not be reached" in d.summary


async def test_bad_key_does_not_try_other_models():
    calls = []

    def handler(req: httpx.Request) -> httpx.Response:
        calls.append(req.url.path)
        return httpx.Response(403, json={"error": {"message": "permission denied"}})

    d = await GeminiPlanner(S, transport(handler)).plan(ANOMALY, window(reject=0.6), normal_policy(), CONTEXT)
    assert len(calls) == 1
    assert d.planner.startswith("heuristic")


async def test_malformed_output_is_never_acted_on():
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": "block them!!"}]}}]})

    d = await GeminiPlanner(S, transport(handler)).plan(ANOMALY, window(reject=0.6), normal_policy(), CONTEXT)
    assert d.action_type == "NONE"
    assert d.planner == "gemini:m-primary"


async def test_unknown_action_and_out_of_range_confidence_are_sanitised():
    def handler(req: httpx.Request) -> httpx.Response:
        return gemini_reply({**DECISION, "action_type": "DELETE_CLIENT", "confidence": 7})

    d = await GeminiPlanner(S, transport(handler)).plan(ANOMALY, window(reject=0.6), normal_policy(), CONTEXT)
    assert d.action_type == "NONE"
    assert d.confidence == 1.0


def test_auto_provider_picks_gemini_when_only_its_key_is_set():
    s = Settings(llm_provider="auto", anthropic_api_key=None, gemini_api_key="k")
    assert s.resolved_provider() == "gemini"
    assert isinstance(get_planner(s), GeminiPlanner)
    assert Settings(llm_provider="auto", anthropic_api_key=None, gemini_api_key=None).resolved_provider() == "heuristic"
