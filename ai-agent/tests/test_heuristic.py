"""Deterministic planner decisions for each anomaly type (no LLM, no network)."""
from __future__ import annotations

from app.agent.llm import HeuristicPlanner
from app.config import Settings
from app.models.schemas import AnomalyEvent
from tests.fakes import normal_policy, window

S = Settings(llm_provider="heuristic", anthropic_api_key=None)
PLANNER = HeuristicPlanner(S)


def anomaly(metric: str, deviation: float = 4.0) -> AnomalyEvent:
    return AnomalyEvent(clientId="c", metric=metric, deviation=deviation, severity="HIGH", window="5m")


async def test_steady_high_reject_raises_limit():
    d = await PLANNER.plan(anomaly("reject_ratio"), window(reject=0.6, burst=1.2), normal_policy())
    assert d.action_type == "ADJUST_LIMIT"
    assert d.new_capacity and d.new_capacity > 100


async def test_raise_is_clamped_to_the_agent_ceiling():
    policy = {**normal_policy(), "capacity": 450, "refillRate": 45.0, "agentMaxCapacity": 500}
    d = await PLANNER.plan(anomaly("reject_ratio"), window(reject=0.6, burst=1.2), policy)
    assert d.action_type == "ADJUST_LIMIT"
    assert d.new_capacity == 500
    assert d.new_refill_rate == 50.0


async def test_at_the_ceiling_alerts_instead_of_raising():
    policy = {**normal_policy(), "capacity": 500, "refillRate": 50.0, "agentMaxCapacity": 500}
    d = await PLANNER.plan(anomaly("reject_ratio"), window(reject=0.6, burst=1.2), policy)
    assert d.action_type == "ALERT"


async def test_recently_blocked_client_is_blocked_not_rewarded():
    # The reported bug: unblock, then flood steadily -> the agent used to raise the limit.
    policy = {**normal_policy(), "recentlyBlocked": True}
    for metric in ("reject_ratio", "request_rate"):
        d = await PLANNER.plan(anomaly(metric), window(reject=0.6, burst=1.2), policy)
        assert d.action_type == "TEMPORARY_BLOCK"


async def test_bursty_high_reject_blocks():
    d = await PLANNER.plan(anomaly("request_rate"), window(reject=0.6, burst=6.0), normal_policy())
    assert d.action_type == "TEMPORARY_BLOCK"
    assert d.block_seconds and d.block_seconds > 0


async def test_slow_and_low_blocks():
    d = await PLANNER.plan(anomaly("slow_and_low"), window(reject=0.1, burst=1.0, unique=25), normal_policy())
    assert d.action_type == "TEMPORARY_BLOCK"


async def test_error_ratio_alerts_not_throttle():
    d = await PLANNER.plan(anomaly("error_ratio"), window(reject=0.0, errors=0.3), normal_policy())
    assert d.action_type == "ALERT"


async def test_burstiness_metric_blocks():
    d = await PLANNER.plan(anomaly("burstiness"), window(reject=0.4, burst=8.0), normal_policy())
    assert d.action_type == "TEMPORARY_BLOCK"


def test_window_minutes_parsing():
    assert AnomalyEvent(clientId="c", metric="reject_ratio", window="1m").window_minutes() == 1
    assert AnomalyEvent(clientId="c", metric="reject_ratio", window="10m").window_minutes() == 10
    assert AnomalyEvent(clientId="c", metric="reject_ratio", window="5").window_minutes() == 5
    assert AnomalyEvent(clientId="c", metric="reject_ratio", window="").window_minutes() is None
    assert AnomalyEvent(clientId="c", metric="reject_ratio", window="hourly").window_minutes() is None
