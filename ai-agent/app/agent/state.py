"""LangGraph state for the agent workflow."""
from __future__ import annotations

import operator
from typing import Annotated, Any, Optional, TypedDict

from app.models.schemas import AnomalyEvent, PlannerDecision


class AgentState(TypedDict, total=False):
    anomaly: AnomalyEvent
    client_id: str

    metrics_windows: list[dict[str, Any]]
    eval_metrics: dict[str, Any]
    baseline: dict[str, Any]
    policy: dict[str, Any]
    classification: str

    decision: Optional[PlannerDecision]
    candidate: Optional[dict[str, Any]]
    simulation: Optional[dict[str, Any]]

    validation_ok: bool
    validation_reasons: list[str]

    gate_result: Optional[dict[str, Any]]
    before_reject: float
    after_reject: float
    outcome: str
    final: str

    # Accumulated across nodes (append semantics).
    steps: Annotated[list[str], operator.add]
    error: Optional[str]
