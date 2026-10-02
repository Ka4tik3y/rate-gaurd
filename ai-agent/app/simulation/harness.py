"""Run a scenario under a static limit and under the AI-assisted adaptive limit, and measure.

The adaptive arm drives the **real** ``HeuristicPlanner`` (the agent's decision logic) with a
faithful offline mirror of the detector, the Policy Gate guardrails, and the closed-loop
outcome check (keep / revert). No outcome is hard-coded — the metrics fall out of the run.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional

from app.agent.llm import HeuristicPlanner
from app.config import Settings
from app.models.schemas import AnomalyEvent, PlannerDecision
from app.simulation.engine import (
    Detector,
    EngineSettings,
    GateResult,
    Outcome,
    SimGate,
    TokenBucket,
    aggregate_window,
)
from app.simulation.scenarios import Scenario

EVAL_WINDOW_MINUTES = 5


@dataclass
class Action:
    t: float
    client: str
    action_type: str
    decision: str
    deviation: float
    prev_capacity: Optional[int] = None
    new_capacity: Optional[int] = None
    block_seconds: Optional[int] = None
    rollback: bool = False


@dataclass
class RunResult:
    adaptive: bool
    outcomes: list[Outcome]
    actions: list[Action] = field(default_factory=list)


def _shape(d: PlannerDecision, cap: int, refill: float, s: Settings):
    """Mirror AgentWorkflow._shape: clamp the planner's proposal into the agent's own bounds."""
    if d.action_type == "ADJUST_LIMIT":
        target = int(d.new_capacity if d.new_capacity else cap)
        lower = max(1, int(cap * (1 - s.max_change_ratio)))
        upper = max(lower, int(cap * (1 + s.max_change_ratio)))
        target = min(max(target, lower), upper)
        nr = d.new_refill_rate if d.new_refill_rate and d.new_refill_rate > 0 else refill
        return ("ADJUST_LIMIT", target, round(float(nr), 3), None)
    if d.action_type == "TEMPORARY_BLOCK":
        sec = min(max(1, int(d.block_seconds or 300)), s.max_block_seconds)
        return ("TEMPORARY_BLOCK", None, None, sec)
    if d.action_type == "ALERT":
        return ("ALERT", None, None, None)
    return None


async def run_arm(scenario: Scenario, adaptive: bool, *,
                  engine: Optional[EngineSettings] = None,
                  planner_settings: Optional[Settings] = None) -> RunResult:
    engine = engine or EngineSettings()
    psettings = planner_settings or Settings(llm_provider="heuristic", anthropic_api_key=None,
                                             max_change_ratio=engine.max_change_ratio,
                                             max_block_seconds=engine.max_block_seconds)
    planner = HeuristicPlanner(psettings)
    detector = Detector(engine)
    gate = SimGate(engine)

    buckets: dict[str, TokenBucket] = {}
    cur_cap: dict[str, int] = {}
    cur_refill: dict[str, float] = {}
    blocked_until: dict[str, float] = {}
    classification = {c: "HIGH_VALUE" for c in scenario.high_value}
    # closed-loop bookkeeping: client -> (reject_before, prev_capacity, prev_refill)
    pending_outcome: dict[str, tuple[float, int, float]] = {}

    def bucket(c: str) -> TokenBucket:
        if c not in buckets:
            buckets[c] = TokenBucket(scenario.static_capacity, scenario.static_refill)
            cur_cap[c] = scenario.static_capacity
            cur_refill[c] = scenario.static_refill
        return buckets[c]

    result = RunResult(adaptive=adaptive, outcomes=[])
    by_client: dict[str, list[Outcome]] = defaultdict(list)

    reqs = scenario.requests
    step_len = engine.window_seconds
    steps = int(scenario.duration_seconds // step_len)
    i = 0
    for step in range(1, steps + 1):
        step_t = step * step_len
        while i < len(reqs) and reqs[i].t < step_t:
            r = reqs[i]
            i += 1
            b = bucket(r.client_id)
            if blocked_until.get(r.client_id, -1.0) > r.t:
                allowed = False
            else:
                allowed = b.allow(r.t)
            err = bool(allowed and r.server_error)
            oc = Outcome(r.t, r.client_id, r.endpoint, allowed, err, r.legitimate)
            result.outcomes.append(oc)
            by_client[r.client_id].append(oc)

        if not adaptive:
            continue
        if step_t < 5 * 60:   # wait for a full evaluation window before detecting (clean baseline)
            continue

        for c, ocs in by_client.items():
            # Don't re-tune a client whose block is still in effect — it is already contained.
            if blocked_until.get(c, -1.0) > step_t:
                continue
            m5 = aggregate_window([o for o in ocs if o.t >= step_t - 5 * 60], 5)
            m10 = aggregate_window([o for o in ocs if o.t >= step_t - 10 * 60], 10)
            if m5["requests"] == 0 and m10["requests"] == 0:
                continue

            # closed-loop: was there an applied ADJUST last step for this client? keep or revert.
            if c in pending_outcome:
                before, prev_cap, prev_refill = pending_outcome.pop(c)
                after = m5["rejectedRatio"]
                if after > before * 1.1 + 0.01:  # WORSE -> rollback (mirror evaluate_outcome)
                    bucket(c).reconfigure(prev_cap, prev_refill)
                    cur_cap[c], cur_refill[c] = prev_cap, prev_refill
                    result.actions.append(Action(step_t, c, "ADJUST_LIMIT", "APPROVED", 0.0,
                                                 new_capacity=prev_cap, rollback=True))

            anomalies = detector.evaluate(c, {5: m5, 10: m10}, ewma_window=5)
            if not anomalies:
                continue
            an = max(anomalies, key=lambda a: a.deviation)
            m = an.metrics  # reason on the window the anomaly fired on (Phase 4 fix)
            policy = {"capacity": cur_cap[c], "refillRate": cur_refill[c],
                      "classification": classification.get(c, "NORMAL")}
            decision = await planner.plan(
                AnomalyEvent(clientId=c, metric=an.metric, currentValue=an.current_value,
                             baseline=an.baseline, deviation=an.deviation, severity=an.severity,
                             window=an.window, reason=an.reason),
                m, policy)
            shaped = _shape(decision, cur_cap[c], cur_refill[c], psettings)
            if shaped is None:
                continue
            atype, new_cap, new_refill, block_sec = shaped
            gres: GateResult = gate.evaluate(step_t, atype, c, classification.get(c, "NORMAL"),
                                             cur_cap[c], new_cap, an.deviation)
            act = Action(step_t, c, atype, gres.decision, an.deviation,
                         prev_capacity=cur_cap[c], new_capacity=new_cap, block_seconds=block_sec)
            if gres.decision == "APPROVED" and atype == "ADJUST_LIMIT":
                pending_outcome[c] = (m["rejectedRatio"], cur_cap[c], cur_refill[c])
                bucket(c).reconfigure(new_cap, new_refill)
                cur_cap[c], cur_refill[c] = new_cap, new_refill
                gate.record_applied(step_t, c)
            elif gres.decision == "APPROVED" and atype == "TEMPORARY_BLOCK":
                blocked_until[c] = step_t + block_sec
                gate.record_applied(step_t, c)
            # ALERT / PENDING_APPROVAL / REJECTED mutate nothing
            result.actions.append(act)

    return result


# ------------------------------------------------------------------- metrics
@dataclass
class ArmMetrics:
    total_requests: int
    allowed: int
    rejected: int
    reject_rate: float
    legit_total: int
    legit_blocked: int
    legit_blocked_rate: float
    abuse_total: int
    abuse_served: int
    abuse_blocked: int
    abuse_block_rate: float
    served_5xx: int
    agent_actions: int
    applied_actions: int
    rejected_by_gate: int
    pending_approvals: int
    alerts: int
    rollbacks: int
    time_to_mitigation_s: Optional[float]
    recovery_time_s: Optional[float]


def measure(scenario: Scenario, run: RunResult) -> ArmMetrics:
    ocs = run.outcomes
    total = len(ocs)
    rejected = sum(1 for o in ocs if not o.allowed)
    allowed = total - rejected
    legit = [o for o in ocs if o.legitimate]
    legit_blocked = sum(1 for o in legit if not o.allowed)
    abuse = [o for o in ocs if o.client_id in scenario.abusive]
    abuse_blocked = sum(1 for o in abuse if not o.allowed)
    abuse_served = len(abuse) - abuse_blocked
    served_5xx = sum(1 for o in ocs if o.error)

    applied = [a for a in run.actions if a.decision == "APPROVED" and not a.rollback]
    rollbacks = sum(1 for a in run.actions if a.rollback)
    rejected_gate = sum(1 for a in run.actions if a.decision == "REJECTED")
    pending = sum(1 for a in run.actions if a.decision == "PENDING_APPROVAL")
    alerts = sum(1 for a in run.actions if a.action_type == "ALERT" and a.decision == "APPROVED")

    # time-to-mitigation: first applied BLOCK on an abusive client, measured from onset
    mit = [a.t for a in applied if a.action_type == "TEMPORARY_BLOCK" and a.client in scenario.abusive]
    ttm = (min(mit) - scenario.onset_seconds) if mit else None
    # recovery: first applied ADJUST on a legitimate (non-abusive) client, from onset
    rec = [a.t for a in applied if a.action_type == "ADJUST_LIMIT" and a.client not in scenario.abusive]
    recovery = (min(rec) - scenario.onset_seconds) if rec else None

    return ArmMetrics(
        total_requests=total, allowed=allowed, rejected=rejected,
        reject_rate=(rejected / total) if total else 0.0,
        legit_total=len(legit), legit_blocked=legit_blocked,
        legit_blocked_rate=(legit_blocked / len(legit)) if legit else 0.0,
        abuse_total=len(abuse), abuse_served=abuse_served, abuse_blocked=abuse_blocked,
        abuse_block_rate=(abuse_blocked / len(abuse)) if abuse else 0.0,
        served_5xx=served_5xx,
        agent_actions=len(run.actions), applied_actions=len(applied),
        rejected_by_gate=rejected_gate, pending_approvals=pending, alerts=alerts,
        rollbacks=rollbacks, time_to_mitigation_s=ttm, recovery_time_s=recovery,
    )


@dataclass
class ScenarioResult:
    name: str
    description: str
    expected: str
    static: ArmMetrics
    adaptive: ArmMetrics
    applied_summary: list[str]
    adaptive_actions: list[Action] = field(default_factory=list)


async def run_scenario(scenario: Scenario, **kw) -> ScenarioResult:
    static_run = await run_arm(scenario, adaptive=False, **kw)
    adaptive_run = await run_arm(scenario, adaptive=True, **kw)
    summary = [
        f"t={int(a.t)}s {a.client}: {a.action_type} -> {a.decision}"
        + (f" (cap {a.prev_capacity}->{a.new_capacity})" if a.new_capacity and a.action_type == 'ADJUST_LIMIT' else "")
        + (f" ({a.block_seconds}s)" if a.block_seconds else "")
        + (" [rollback]" if a.rollback else "")
        for a in adaptive_run.actions
    ]
    return ScenarioResult(
        name=scenario.name, description=scenario.description, expected=scenario.expected,
        static=measure(scenario, static_run), adaptive=measure(scenario, adaptive_run),
        applied_summary=summary, adaptive_actions=adaptive_run.actions,
    )


async def run_all(**kw) -> list[ScenarioResult]:
    from app.simulation.scenarios import all_scenarios
    return [await run_scenario(s, **kw) for s in all_scenarios()]
