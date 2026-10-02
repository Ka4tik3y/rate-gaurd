"""FastAPI routes: receive anomaly events and run the agent."""
from __future__ import annotations

from fastapi import APIRouter, Request

from app.config import settings
from app.models.schemas import AnomalyEvent, InvestigationResult

router = APIRouter()


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "llm_provider": settings.resolved_provider()}


@router.post("/anomalies", response_model=InvestigationResult)
async def investigate(event: AnomalyEvent, request: Request) -> InvestigationResult:
    """Receive an AnomalyEvent (from the deterministic detector) and run the closed-loop agent."""
    workflow = request.app.state.workflow
    return await workflow.run(event)
