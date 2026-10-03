"""The LangGraph closed-loop agent workflow (spec §27, §30, §31).

OBSERVE -> DETECT(anomaly in) -> INVESTIGATE -> SIMULATE -> PROPOSE -> VALIDATE(gate) -> ACT ->
MEASURE -> KEEP/REVERT. The LLM only chooses the cause and candidate action; the Policy Gate (Java)
validates and executes, and outcome verification + rollback are deterministic.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from langgraph.graph import END, StateGraph

from app.agent.llm import Planner
from app.agent.state import AgentState
from app.config import Settings
from app.models.schemas import AnomalyEvent, InvestigationResult, PlannerDecision
from app.tools.tools import AgentTools

log = logging.getLogger(__name__)


class AgentWorkflow:
    def __init__(self, tools: AgentTools, planner: Planner, settings: Settings):
        self._tools = tools
        self._planner = planner
        self._s = settings
        self._graph = self._build()

    # ---------- nodes ----------
    async def inspect_metrics(self, state: AgentState) -> dict[str, Any]:
        cid = state["client_id"]
        windows = await self._tools.get_client_metrics(cid)
        eval_m = self._pick_window(windows, state["anomaly"].window_minutes())
        return {
            "metrics_windows": windows,
            "eval_metrics": eval_m,
            "before_reject": float(eval_m.get("rejectedRatio", 0) or 0),
            "steps": [f"inspected metrics: {len(windows)} windows, reject_ratio={eval_m.get('rejectedRatio', 0):.2f}"],
        }

    async def inspect_baseline(self, state: AgentState) -> dict[str, Any]:
        baseline = await self._tools.get_historical_metrics(state["client_id"])
        return {"baseline": baseline, "steps": ["inspected historical baseline"]}

    async def inspect_policy(self, state: AgentState) -> dict[str, Any]:
        policy = await self._tools.get_current_policy(state["client_id"])
        classification = policy.get("classification", "NORMAL")
        return {
            "policy": policy,
            "classification": classification,
            "steps": [f"current policy capacity={policy.get('capacity')} classification={classification}"],
        }

    async def determine_cause(self, state: AgentState) -> dict[str, Any]:
        context = {
            "metric_windows": state.get("metrics_windows", []),
            "baseline": state.get("baseline", {}),
            "recent_actions": await self._recent_actions(state["client_id"]),
        }
        decision = await self._planner.plan(state["anomaly"], state["eval_metrics"], state["policy"], context)
        return {"decision": decision, "steps": [
            f"cause ({decision.planner or 'planner'}): {decision.cause} -> {decision.action_type} "
            f"(conf {decision.confidence:.2f})"]}

    async def _recent_actions(self, client_id: str) -> list[dict[str, Any]]:
        """Compact audit history so the planner knows what was already tried on this client."""
        try:
            entries = await self._tools.get_action_history(client_id, 8)
        except Exception:  # history is helpful context, never required
            return []
        keep = ("timestamp", "source", "actionType", "decision", "reasons",
                "previousCapacity", "appliedCapacity", "appliedBlockSeconds")
        return [{k: e.get(k) for k in keep if e.get(k) is not None} for e in entries or []]

    async def generate_action(self, state: AgentState) -> dict[str, Any]:
        """Shape the planner's decision into a concrete, in-bounds candidate (defense in depth)."""
        d: PlannerDecision = state["decision"]
        policy = state["policy"]
        candidate = self._shape(d, policy)
        return {"candidate": candidate, "steps": [f"candidate action: {candidate}"]}

    async def simulate(self, state: AgentState) -> dict[str, Any]:
        candidate = state.get("candidate")
        if not candidate or candidate.get("actionType") != "ADJUST_LIMIT":
            return {"steps": ["simulation skipped (not a limit change)"]}
        sim = await self._tools.simulate_policy_change(
            state["client_id"], candidate["newCapacity"], candidate.get("newRefillRate"),
            self._s.evaluation_window_minutes)
        return {"simulation": sim, "steps": [
            f"simulation: observed={sim.get('observedRequests')} "
            f"current_allowed={sim.get('currentEstimatedAllowed')} "
            f"simulated_allowed={sim.get('simulatedAllowed')}"]}

    async def validate(self, state: AgentState) -> dict[str, Any]:
        d: PlannerDecision = state["decision"]
        candidate = state.get("candidate")
        reasons: list[str] = []
        if candidate is None:
            reasons.append("no actionable candidate")
        if d.confidence < self._s.min_confidence:
            reasons.append(f"confidence {d.confidence:.2f} below minimum {self._s.min_confidence}")
        ok = not reasons
        return {"validation_ok": ok, "validation_reasons": reasons,
                "steps": [f"validation {'passed' if ok else 'failed: ' + '; '.join(reasons)}"]}

    async def policy_gate(self, state: AgentState) -> dict[str, Any]:
        candidate = state["candidate"]
        anomaly = state["anomaly"]
        cid = state["client_id"]
        reason = state["decision"].rationale or state["decision"].cause
        trigger = anomaly.effective_trigger()
        action = candidate["actionType"]

        if action == "ADJUST_LIMIT":
            res = await self._tools.propose_rate_limit_change(
                cid, candidate["newCapacity"], candidate.get("newRefillRate"), trigger, reason, anomaly)
        elif action == "TEMPORARY_BLOCK":
            res = await self._tools.propose_temporary_block(
                cid, candidate["blockSeconds"], trigger, reason, anomaly)
        else:
            res = await self._tools.send_alert(cid, candidate.get("alertMessage", "anomaly"), trigger, reason, anomaly)

        return {"gate_result": res, "steps": [f"policy gate: {res.get('decision')} ({'; '.join(res.get('reasons', []))})"]}

    async def observe_outcome(self, state: AgentState) -> dict[str, Any]:
        await asyncio.sleep(self._s.outcome_wait_seconds)
        windows = await self._tools.get_client_metrics(state["client_id"])
        eval_m = self._pick_window(windows, state["anomaly"].window_minutes())
        after = float(eval_m.get("rejectedRatio", 0) or 0)
        return {"after_reject": after, "steps": [f"observed outcome after {self._s.outcome_wait_seconds}s: reject_ratio={after:.2f}"]}

    async def evaluate_outcome(self, state: AgentState) -> dict[str, Any]:
        before = state.get("before_reject", 0.0)
        after = state.get("after_reject", 0.0)
        if after < before * 0.9:
            outcome = "IMPROVED"
        elif after > before * 1.1 + 0.01:
            outcome = "WORSE"
        else:
            outcome = "UNCHANGED"
        return {"outcome": outcome, "steps": [f"outcome: {outcome} (before={before:.2f} after={after:.2f})"]}

    async def keep(self, state: AgentState) -> dict[str, Any]:
        return {"final": "KEPT", "steps": ["decision kept"]}

    async def revert(self, state: AgentState) -> dict[str, Any]:
        """Roll back a worse-than-before limit change by restoring the previous capacity."""
        policy = state["policy"]
        anomaly = state["anomaly"]
        res = await self._tools.propose_rate_limit_change(
            state["client_id"], int(policy["capacity"]), float(policy.get("refillRate", 10)),
            "rollback", "outcome worse than baseline; reverting to previous limit", anomaly)
        final = "REVERTED" if res.get("decision") == "APPROVED" else "REVERT_FAILED"
        return {"final": final, "steps": [f"rollback: {res.get('decision')} ({'; '.join(res.get('reasons', []))})"]}

    async def finalize(self, state: AgentState) -> dict[str, Any]:
        if state.get("final"):
            return {"steps": ["finalized"]}
        gate = state.get("gate_result") or {}
        decision = gate.get("decision")
        if decision == "PENDING_APPROVAL":
            final = "PENDING"
        elif decision == "REJECTED":
            final = "REJECTED"
        elif decision == "APPROVED":
            final = "KEPT"
        else:
            final = "NONE"
        return {"final": final, "steps": ["finalized"]}

    # ---------- routing ----------
    def _after_validate(self, state: AgentState) -> str:
        return "gate" if state.get("validation_ok") else "end"

    def _after_gate(self, state: AgentState) -> str:
        gate = state.get("gate_result") or {}
        candidate = state.get("candidate") or {}
        if gate.get("decision") == "APPROVED" and candidate.get("actionType") == "ADJUST_LIMIT":
            return "observe"
        return "end"

    def _after_eval(self, state: AgentState) -> str:
        return "revert" if state.get("outcome") == "WORSE" else "keep"

    # ---------- helpers ----------
    def _pick_window(self, windows: list[dict[str, Any]],
                     preferred: int | None = None) -> dict[str, Any]:
        """Pick the window to reason over.

        Prefer the window the detector fired on (``preferred``), then the configured
        evaluation window, then the widest available. Evaluating on the detector's own
        window keeps the planner's view consistent with what tripped the anomaly — in
        particular it avoids reading a short recent burst through a wider window, where
        ``burstiness`` (peak-minute / mean-minute) is mechanically inflated.
        """
        if not windows:
            return {}
        for target in (preferred, self._s.evaluation_window_minutes):
            if target is None:
                continue
            for w in windows:
                if w.get("windowMinutes") == target:
                    return w
        return max(windows, key=lambda w: w.get("windowMinutes", 0))

    def _shape(self, d: PlannerDecision, policy: dict[str, Any]) -> dict[str, Any] | None:
        cap = int(policy.get("capacity", 100))
        refill = float(policy.get("refillRate", 10))
        ratio = self._s.max_change_ratio
        if d.action_type == "ADJUST_LIMIT":
            target = int(d.new_capacity if d.new_capacity else cap)
            lower = max(1, int(cap * (1 - ratio)))
            upper = max(lower, int(cap * (1 + ratio)))
            target = min(max(target, lower), upper)
            new_refill = d.new_refill_rate if d.new_refill_rate and d.new_refill_rate > 0 else refill
            return {"actionType": "ADJUST_LIMIT", "newCapacity": target, "newRefillRate": round(float(new_refill), 3)}
        if d.action_type == "TEMPORARY_BLOCK":
            seconds = int(d.block_seconds or 300)
            seconds = min(max(1, seconds), self._s.max_block_seconds)
            return {"actionType": "TEMPORARY_BLOCK", "blockSeconds": seconds}
        if d.action_type == "ALERT":
            return {"actionType": "ALERT", "alertMessage": d.alert_message or "anomaly detected"}
        return None

    # ---------- graph ----------
    def _build(self):
        g = StateGraph(AgentState)
        g.add_node("inspect_metrics", self.inspect_metrics)
        g.add_node("inspect_baseline", self.inspect_baseline)
        g.add_node("inspect_policy", self.inspect_policy)
        g.add_node("determine_cause", self.determine_cause)
        g.add_node("generate_action", self.generate_action)
        g.add_node("simulate", self.simulate)
        g.add_node("validate", self.validate)
        g.add_node("policy_gate", self.policy_gate)
        g.add_node("observe_outcome", self.observe_outcome)
        g.add_node("evaluate_outcome", self.evaluate_outcome)
        g.add_node("keep", self.keep)
        g.add_node("revert", self.revert)
        g.add_node("finalize", self.finalize)

        g.set_entry_point("inspect_metrics")
        g.add_edge("inspect_metrics", "inspect_baseline")
        g.add_edge("inspect_baseline", "inspect_policy")
        g.add_edge("inspect_policy", "determine_cause")
        g.add_edge("determine_cause", "generate_action")
        g.add_edge("generate_action", "simulate")
        g.add_edge("simulate", "validate")
        g.add_conditional_edges("validate", self._after_validate, {"gate": "policy_gate", "end": "finalize"})
        g.add_conditional_edges("policy_gate", self._after_gate, {"observe": "observe_outcome", "end": "finalize"})
        g.add_edge("observe_outcome", "evaluate_outcome")
        g.add_conditional_edges("evaluate_outcome", self._after_eval, {"revert": "revert", "keep": "keep"})
        g.add_edge("revert", "finalize")
        g.add_edge("keep", "finalize")
        g.add_edge("finalize", END)
        return g.compile()

    # ---------- entry point ----------
    async def run(self, anomaly: AnomalyEvent) -> InvestigationResult:
        initial: AgentState = {"anomaly": anomaly, "client_id": anomaly.clientId, "steps": []}
        try:
            final_state = await self._graph.ainvoke(initial)
        except Exception as e:  # any failure -> no further action; current static policy stands (§24)
            log.exception("agent workflow failed")
            return InvestigationResult(client_id=anomaly.clientId, final="ERROR", error=str(e))

        decision = final_state.get("decision")
        gate = final_state.get("gate_result") or {}
        return InvestigationResult(
            client_id=anomaly.clientId,
            cause=decision.cause if decision else "",
            decision=decision,
            gate_decision=gate.get("decision"),
            gate_reasons=gate.get("reasons", []),
            action_id=gate.get("actionId"),
            simulation=final_state.get("simulation"),
            outcome=final_state.get("outcome", "NA"),
            final=final_state.get("final", "NONE"),
            steps=final_state.get("steps", []),
            summary=decision.summary if decision else "",
            planner=decision.planner if decision else "",
        )
