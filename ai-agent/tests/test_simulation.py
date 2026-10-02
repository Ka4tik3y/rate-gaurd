"""Phase 5 — tests for the offline simulation engine and the evaluation harness.

These assert the *mechanics* (token bucket, aggregation, detector, gate) exactly, and the
*direction* of each scenario's outcome (adaptive vs static) — never a hard-coded verdict.
"""
from __future__ import annotations

from app.simulation.engine import (
    Detector,
    EngineSettings,
    Outcome,
    SimGate,
    TokenBucket,
    aggregate_window,
)
from app.simulation.harness import run_scenario
from app.simulation import scenarios
from app.simulation.report import to_markdown


# --------------------------------------------------------------- token bucket
def test_token_bucket_allows_up_to_capacity_then_rejects():
    b = TokenBucket(capacity=5, refill_rate=0.0)
    allowed = sum(1 for _ in range(10) if b.allow(0.0))
    assert allowed == 5  # burst of capacity, then dry


def test_token_bucket_refills_over_time():
    b = TokenBucket(capacity=2, refill_rate=1.0)
    assert b.allow(0.0) and b.allow(0.0)      # drain the 2 tokens
    assert not b.allow(0.0)                    # empty
    assert b.allow(1.0)                        # 1s later -> 1 token refilled


def test_token_bucket_reconfigure_caps_tokens():
    b = TokenBucket(capacity=100, refill_rate=10)
    b.reconfigure(10, 5)
    assert b.tokens <= 10 and b.capacity == 10 and b.refill_rate == 5


# --------------------------------------------------------------- aggregation
def test_aggregate_window_ratios_and_burstiness():
    ocs = []
    # minute 0: 10 requests (2 rejected, 1 error); minutes 1-4: empty -> bursty
    for i in range(10):
        ocs.append(Outcome(i * 1.0, "c", "/a", allowed=(i >= 2), error=(i == 2), legitimate=True))
    m = aggregate_window(ocs, 5)
    assert m["requests"] == 10
    assert m["rejected"] == 2
    assert abs(m["rejectedRatio"] - 0.2) < 1e-9
    assert m["burstiness"] == 5.0            # all in 1 of 5 minute-buckets


# --------------------------------------------------------------- detector
def test_detector_flags_request_rate_spike_with_high_z():
    s = EngineSettings()
    d = Detector(s)
    base = {"requests": 300, "rejected": 0, "errors": 0, "rejectedRatio": 0.0, "errorRatio": 0.0,
            "requestRatePerMinute": 60.0, "uniqueEndpoints": 1, "burstiness": 1.0, "windowMinutes": 5}
    # warm up the baseline with mild variance
    for r in (58, 62, 59, 61, 60):
        d.evaluate("c", {5: {**base, "requestRatePerMinute": float(r)}}, ewma_window=5)
    spike = {**base, "requestRatePerMinute": 600.0}
    events = d.evaluate("c", {5: spike}, ewma_window=5)
    rr = [e for e in events if e.metric == "request_rate"]
    assert rr and rr[0].deviation >= s.z_threshold


def test_detector_slow_and_low_needs_wide_spread():
    s = EngineSettings()
    d = Detector(s)
    m = {"requests": 40, "rejected": 0, "errors": 0, "rejectedRatio": 0.0, "errorRatio": 0.0,
         "requestRatePerMinute": 4.0, "uniqueEndpoints": 40, "burstiness": 1.0, "windowMinutes": 10}
    events = d.evaluate("c", {10: m}, ewma_window=5)
    sl = [e for e in events if e.metric == "slow_and_low"]
    assert sl and sl[0].deviation >= s.min_evidence_deviation  # 40/15 > 2 -> passes the gate


# --------------------------------------------------------------- sim gate
def test_sim_gate_rejects_weak_evidence():
    g = SimGate(EngineSettings())
    r = g.evaluate(0, "ADJUST_LIMIT", "c", "NORMAL", 100, 140, deviation=1.0)
    assert r.decision == "REJECTED"


def test_sim_gate_rejects_over_ratio_change():
    g = SimGate(EngineSettings())
    r = g.evaluate(0, "ADJUST_LIMIT", "c", "NORMAL", 100, 1000, deviation=5.0)
    assert r.decision == "REJECTED"


def test_sim_gate_high_value_block_is_pending():
    g = SimGate(EngineSettings())
    r = g.evaluate(0, "TEMPORARY_BLOCK", "c", "HIGH_VALUE", 100, None, deviation=5.0)
    assert r.decision == "PENDING_APPROVAL"


def test_sim_gate_cooldown_blocks_second_action():
    s = EngineSettings()
    g = SimGate(s)
    assert g.evaluate(0, "ADJUST_LIMIT", "c", "NORMAL", 100, 140, 5.0).decision == "APPROVED"
    g.record_applied(0, "c")
    assert g.evaluate(30, "ADJUST_LIMIT", "c", "NORMAL", 140, 180, 5.0).decision == "REJECTED"


# --------------------------------------------------------------- harness / scenarios
async def test_legit_spike_reduces_false_blocks():
    r = await run_scenario(scenarios.legit_spike())
    assert r.adaptive.legit_blocked_rate < r.static.legit_blocked_rate  # fewer false blocks
    assert any(a.action_type == "ADJUST_LIMIT" and a.decision == "APPROVED"
               for a in r.adaptive_actions)


async def test_scraper_burst_contains_abuse_with_blocks():
    r = await run_scenario(scenarios.scraper_burst())
    assert r.adaptive.abuse_block_rate >= r.static.abuse_block_rate
    assert any(a.action_type == "TEMPORARY_BLOCK" and a.decision == "APPROVED"
               for a in r.adaptive_actions)


async def test_slow_and_low_detected_and_blocked():
    r = await run_scenario(scenarios.slow_and_low())
    assert r.static.abuse_block_rate == 0.0           # volume-based static misses it entirely
    assert r.adaptive.abuse_block_rate > 0.5          # adaptive blocks the scanner


async def test_noisy_high_value_block_held_for_approval():
    r = await run_scenario(scenarios.noisy_tenant())
    assert r.adaptive.pending_approvals >= 1
    # a HIGH_VALUE client is never auto-blocked (block always held for human approval)
    assert not any(a.action_type == "TEMPORARY_BLOCK" and a.decision == "APPROVED"
                   and a.client == "vip-tenant" for a in r.adaptive_actions)


async def test_error_spike_alerts_not_throttles():
    r = await run_scenario(scenarios.error_spike())
    assert r.adaptive.alerts >= 1
    assert r.adaptive.abuse_block_rate == 0.0
    assert r.adaptive.served_5xx == r.static.served_5xx   # throttling a 5xx storm would not help


async def test_report_renders_all_scenarios():
    from app.simulation.harness import run_all
    results = await run_all()
    md = to_markdown(results)
    assert "static vs AI-assisted adaptive" in md
    for name in ("scraper_burst", "legit_spike", "slow_and_low", "noisy_tenant", "error_spike"):
        assert name in md
