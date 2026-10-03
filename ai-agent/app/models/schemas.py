"""Pydantic models shared across the agent."""
from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class AnomalyEvent(BaseModel):
    """The deterministic detector's event (mirrors the Java AnomalyEvent, spec §19)."""
    clientId: str
    metric: str
    currentValue: float = 0.0
    baseline: float = 0.0
    deviation: float = 0.0
    severity: str = "MEDIUM"
    window: str = "5m"
    reason: str = ""
    trigger: Optional[str] = None

    def effective_trigger(self) -> str:
        return self.trigger or f"{self.metric}_anomaly"

    def window_minutes(self) -> Optional[int]:
        """The detector's window as minutes (e.g. "1m" -> 1), or None if unparseable.

        The agent evaluates on the same window the detector fired on, so a short recent
        burst is not mis-read as abuse via a window-inflated burstiness metric.
        """
        raw = (self.window or "").strip().lower().rstrip("m")
        try:
            return int(raw)
        except ValueError:
            return None


class PlannerDecision(BaseModel):
    """What the planner (LLM or heuristic) decides to do about an anomaly."""
    cause: str
    action_type: str = "NONE"  # ADJUST_LIMIT | TEMPORARY_BLOCK | ALERT | NONE
    new_capacity: Optional[int] = None
    new_refill_rate: Optional[float] = None
    block_seconds: Optional[int] = None
    alert_message: Optional[str] = None
    rationale: str = ""
    confidence: float = 0.0
    # Human-facing investigation write-up (LLM planners; the heuristic writes a short templated one).
    summary: str = ""
    evidence: list[str] = Field(default_factory=list)
    # Which planner produced this, e.g. "gemini:gemini-3.5-flash" or "heuristic".
    planner: str = ""


class InvestigationResult(BaseModel):
    """The agent's end-to-end result for one anomaly."""
    client_id: str
    cause: str = ""
    decision: Optional[PlannerDecision] = None
    gate_decision: Optional[str] = None  # APPROVED | REJECTED | PENDING_APPROVAL | NONE
    gate_reasons: list[str] = Field(default_factory=list)
    action_id: Optional[str] = None
    simulation: Optional[dict[str, Any]] = None
    outcome: str = "NA"  # IMPROVED | UNCHANGED | WORSE | NA
    final: str = "NONE"  # KEPT | REVERTED | PENDING | REJECTED | NONE | ERROR
    steps: list[str] = Field(default_factory=list)
    error: Optional[str] = None
    summary: str = ""
    planner: str = ""
