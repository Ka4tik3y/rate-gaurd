"""Autopilot: picks up detector anomalies and investigates them without a manual trigger."""
from __future__ import annotations

from app.config import Settings
from app.models.schemas import AnomalyEvent, InvestigationResult
from app.services.autopilot import AutoPilot


def settings(**over) -> Settings:
    base = dict(llm_provider="heuristic", anthropic_api_key=None,
                auto_cooldown_seconds=120.0, auto_history_size=10)
    base.update(over)
    return Settings(**base)


class FakeSource:
    def __init__(self, batches):
        self._batches = batches
        self.calls = 0

    async def get_anomalies(self):
        batch = self._batches[min(self.calls, len(self._batches) - 1)]
        self.calls += 1
        return batch


class FakeWorkflow:
    def __init__(self):
        self.runs: list[AnomalyEvent] = []

    async def run(self, anomaly: AnomalyEvent) -> InvestigationResult:
        self.runs.append(anomaly)
        return InvestigationResult(client_id=anomaly.clientId, final="KEPT", action_id=f"act-{len(self.runs)}")


class Clock:
    def __init__(self, t: float = 1000.0):
        self.t = t

    def __call__(self) -> float:
        return self.t


def ev(cid, metric="reject_ratio", deviation=2.6, ts="2026-10-03T10:00:00Z"):
    return {"clientId": cid, "metric": metric, "currentValue": 0.65, "baseline": 0.5,
            "deviation": deviation, "severity": "MEDIUM", "window": "5m", "reason": "r", "timestamp": ts}


async def test_new_anomaly_is_investigated_once():
    wf = FakeWorkflow()
    pilot = AutoPilot(FakeSource([[ev("c1")], [ev("c1")]]), wf, settings(), Clock())
    first = await pilot.tick()
    second = await pilot.tick()  # same event again -> already seen
    assert len(first) == 1 and second == []
    assert len(wf.runs) == 1
    assert wf.runs[0].trigger == "auto:reject_ratio"
    assert pilot.history[0]["source"] == "AUTO"


async def test_strongest_anomaly_per_client_wins():
    wf = FakeWorkflow()
    batch = [ev("c1", "reject_ratio", 2.6), ev("c1", "burstiness", 5.0), ev("c2", "error_ratio", 3.0)]
    pilot = AutoPilot(FakeSource([batch]), wf, settings(), Clock())
    await pilot.tick()
    by_client = {a.clientId: a.metric for a in wf.runs}
    assert by_client == {"c1": "burstiness", "c2": "error_ratio"}


async def test_cooldown_skips_then_allows():
    wf = FakeWorkflow()
    clock = Clock()
    batches = [[ev("c1", ts="t1")], [ev("c1", ts="t2")], [ev("c1", ts="t3")]]
    pilot = AutoPilot(FakeSource(batches), wf, settings(auto_cooldown_seconds=120), clock)
    await pilot.tick()            # runs
    clock.t += 30
    await pilot.tick()            # within cooldown -> skipped
    assert len(wf.runs) == 1 and pilot.skipped_cooldown == 1
    clock.t += 200
    await pilot.tick()            # cooldown elapsed -> runs again
    assert len(wf.runs) == 2


async def test_gateway_failure_does_not_crash_status():
    class Broken:
        async def get_anomalies(self):
            raise RuntimeError("gateway down")

    pilot = AutoPilot(Broken(), FakeWorkflow(), settings(), Clock())
    try:
        await pilot.tick()
    except RuntimeError:
        pass  # run_forever catches this; tick just propagates
    assert pilot.status()["polls"] == 1
