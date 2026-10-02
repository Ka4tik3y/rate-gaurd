"""FastAPI entry point for the autonomous rate-limiting agent (Phase 4).

The agent is independently deployable and entirely off the request hot path. If it is down, the Java
rate limiter keeps working on its static policy (architectural rules 1 & 12).
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.agent.llm import get_planner
from app.agent.workflow import AgentWorkflow
from app.api.routes import router
from app.config import settings
from app.services.gateway import GatewayClient
from app.tools.tools import AgentTools

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("agent")


@asynccontextmanager
async def lifespan(app: FastAPI):
    gateway = GatewayClient(settings)
    tools = AgentTools(gateway)
    planner = get_planner(settings)
    app.state.gateway = gateway
    app.state.workflow = AgentWorkflow(tools, planner, settings)
    log.info("agent ready: gateway=%s provider=%s", settings.gateway_base_url, settings.resolved_provider())
    try:
        yield
    finally:
        await gateway.aclose()


app = FastAPI(title="Autonomous Rate-Limiting Agent", version="0.4.0", lifespan=lifespan)
app.include_router(router)
