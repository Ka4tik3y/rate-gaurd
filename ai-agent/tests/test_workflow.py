"""End-to-end agent workflow tests with a fake gateway and the deterministic planner."""
from __future__ import annotations

from app.agent.llm import HeuristicPlanner
from app.agent.workflow import AgentWorkflow
from app.config import Settings
from app.models.schemas import AnomalyEvent
from app.tools.tools import AgentTools
from tests.fakes import APPROVED, PENDING, REJECTED, FakeGateway, normal_policy, window


def make_settings(**over):
    base = dict(llm_provider="heuristic", anthropic_api_key=None, outcome_wait_seconds=0.0,
                min_confidence=0.5, evaluation_window_minutes=5, max_change_ratio=0.5, max_block_seconds=600)
    base.update(over)
    return Settings(**base)


def make_workflow(gateway, settings=None):
    settings = settings or make_settings()
    return AgentWorkflow(AgentTools(gateway), HeuristicPlanner(settings), settings)


def anomaly(metric="reject_ratio", deviation=4.2):
    return AnomalyEvent(clientId="c", metric=metric, deviation=deviation, severity="HIGH", window="5m")


async def test_adjust_improves_and_is_kept():
    gw = FakeGateway(normal_policy(), [[window(0.6, 1.2)], [window(0.2, 1.2)]], [APPROVED])
    result = await make_workflow(gw).run(anomaly())
    assert result.decision.action_type == "ADJUST_LIMIT"
    assert result.gate_decision == "APPROVED"
    assert result.outcome == "IMPROVED"
    assert result.final == "KEPT"
    assert len(gw.proposals) == 1
    assert gw.proposals[0]["actionType"] == "ADJUST_LIMIT"
    assert 50 <= gw.proposals[0]["newCapacity"] <= 150  # within +/-50% of 100


async def test_adjust_worse_triggers_rollback():
    # after the change the reject ratio is worse -> agent reverts to the previous capacity
    gw = FakeGateway(normal_policy(capacity=100), [[window(0.5, 1.2)], [window(0.9, 1.2)]], [APPROVED, APPROVED])
    result = await make_workflow(gw).run(anomaly())
    assert result.outcome == "WORSE"
    assert result.final == "REVERTED"
    assert len(gw.proposals) == 2
    assert gw.proposals[1]["actionType"] == "ADJUST_LIMIT"
    assert gw.proposals[1]["newCapacity"] == 100  # restored previous limit
    assert gw.proposals[1]["trigger"] == "rollback"


async def test_slow_and_low_results_in_block_no_outcome_loop():
    gw = FakeGateway(normal_policy(), [[window(0.1, 1.0, unique=25)]], [APPROVED])
    result = await make_workflow(gw).run(anomaly(metric="slow_and_low"))
    assert gw.proposals[0]["actionType"] == "TEMPORARY_BLOCK"
    assert result.final == "KEPT"
    assert result.outcome == "NA"  # blocks don't run the limit-adjust outcome loop


async def test_gate_rejection_stops_cleanly():
    gw = FakeGateway(normal_policy(), [[window(0.6, 1.2)]], [REJECTED])
    result = await make_workflow(gw).run(anomaly())
    assert result.gate_decision == "REJECTED"
    assert result.final == "REJECTED"
    assert len(gw.proposals) == 1  # proposed once, nothing applied, no rollback


async def test_high_value_block_pending_is_not_applied():
    gw = FakeGateway(normal_policy(classification="HIGH_VALUE"), [[window(0.1, 1.0, unique=25)]], [PENDING])
    result = await make_workflow(gw).run(anomaly(metric="slow_and_low"))
    assert result.gate_decision == "PENDING_APPROVAL"
    assert result.final == "PENDING"


async def test_error_ratio_raises_alert_only():
    gw = FakeGateway(normal_policy(), [[window(0.0, 1.0, errors=0.3)]], [APPROVED])
    result = await make_workflow(gw).run(anomaly(metric="error_ratio"))
    assert gw.proposals[0]["actionType"] == "ALERT"
    assert result.final == "KEPT"


async def test_low_confidence_never_reaches_gate():
    settings = make_settings(min_confidence=0.95)
    gw = FakeGateway(normal_policy(), [[window(0.0, 1.0)]], [APPROVED])
    result = await make_workflow(gw, settings).run(anomaly(metric="mystery"))
    assert result.final == "NONE"
    assert gw.proposals == []  # nothing proposed when confidence is too low


async def test_reject_ratio_evaluated_on_detector_window_adjusts():
    # A short recent burst reads as non-bursty at 1m but is window-inflated at 5m
    # (burstiness = peak-minute / mean-minute). The detector fired on 1m, so the agent
    # must evaluate on 1m and raise the limit for legitimate demand — not read the
    # inflated 5m burstiness as abuse and block a legitimate client. The configured
    # evaluation window (5m) is deliberately wider than the anomaly's window here.
    snap = [window(0.3, burst=1.0, minutes=1), window(0.3, burst=5.0, minutes=5)]
    gw = FakeGateway(normal_policy(), [snap, snap], [APPROVED])
    settings = make_settings(evaluation_window_minutes=5)
    ev = AnomalyEvent(clientId="c", metric="reject_ratio", deviation=4.2, severity="HIGH", window="1m")
    result = await make_workflow(gw, settings).run(ev)
    assert result.decision.action_type == "ADJUST_LIMIT"
    assert result.gate_decision == "APPROVED"
    assert result.final == "KEPT"
    assert gw.proposals[0]["actionType"] == "ADJUST_LIMIT"


async def test_reject_ratio_genuine_burst_on_its_window_blocks():
    # When the anomaly's own window is genuinely bursty and heavily rejected, the agent
    # still treats it as abuse and blocks — the window-alignment fix does not weaken this.
    snap = [window(0.6, burst=5.0, minutes=5)]
    gw = FakeGateway(normal_policy(), [snap], [APPROVED])
    ev = AnomalyEvent(clientId="c", metric="reject_ratio", deviation=4.2, severity="HIGH", window="5m")
    result = await make_workflow(gw).run(ev)
    assert result.decision.action_type == "TEMPORARY_BLOCK"
    assert gw.proposals[0]["actionType"] == "TEMPORARY_BLOCK"


async def test_gateway_failure_is_safe():
    class Broken(FakeGateway):
        async def get_metrics(self, client_id):
            raise RuntimeError("gateway down")

    gw = Broken(normal_policy(), [[window(0.6)]], [APPROVED])
    result = await make_workflow(gw).run(anomaly())
    assert result.final == "ERROR"
    assert gw.proposals == []  # no mutation attempted when the agent cannot inspect state
