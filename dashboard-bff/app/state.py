"""In-memory BFF state: client registry, investigations, traffic-series ring buffer.

This is demo state the real backend doesn't track globally (it is per-client only). It lets the
dashboard show aggregate views (overview, clients list, traffic chart) built from real per-client
calls plus a Prometheus sampler.
"""
from __future__ import annotations

import time
from collections import deque
from typing import Any

from app.config import settings


class State:
    def __init__(self) -> None:
        # client ids the dashboard has interacted with (traffic gen, investigate, simulate, etc.)
        self.clients: set[str] = set()
        # investigations the agent has run through this BFF, newest first
        self.investigations: list[dict[str, Any]] = []
        # prometheus samples: (ts, totals dict)
        self.samples: deque[tuple[float, dict[str, float]]] = deque(maxlen=settings.series_points)
        # demo toggle: pretend the agent is offline (limiter keeps running)
        self.agent_offline = False

    def register(self, client_id: str) -> None:
        if client_id:
            self.clients.add(client_id)

    def add_investigation(self, inv: dict[str, Any]) -> None:
        self.investigations.insert(0, inv)
        del self.investigations[50:]

    def add_sample(self, totals: dict[str, float]) -> None:
        self.samples.append((time.time() * 1000, totals))


state = State()
