"""FastAPI routes: receive anomaly events and run the agent."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request

from app.config import settings
from app.models.schemas import AnomalyEvent, InvestigationResult

router = APIRouter()


@router.get("/health")
async def health() -> dict[str, str]:
    provider = settings.resolved_provider()
    model = {"anthropic": settings.anthropic_model, "gemini": settings.gemini_model}.get(provider, "")
    return {"status": "ok", "llm_provider": f"{provider}:{model}" if model else provider}


@router.post("/anomalies", response_model=InvestigationResult)
async def investigate(event: AnomalyEvent, request: Request) -> InvestigationResult:
    """Receive an AnomalyEvent (from the deterministic detector) and run the closed-loop agent."""
    workflow = request.app.state.workflow
    return await workflow.run(event)


@router.get("/investigations")
async def investigations(request: Request) -> list[dict[str, Any]]:
    """Investigations the autopilot ran on its own, newest first."""
    return list(request.app.state.autopilot.history)


@router.get("/autopilot")
async def autopilot_status(request: Request) -> dict[str, Any]:
    return request.app.state.autopilot.status()
