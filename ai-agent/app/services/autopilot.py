"""Autopilot: investigate detector anomalies automatically, with no manual trigger.

Pull model — the agent polls ``GET /agent/anomalies`` on the gateway. The Java rate limiter never
calls (or waits on) the agent, so if the agent is down nothing on the request path changes
(architectural rule 1). Every action still goes through the normal workflow and the Policy Gate.

Per poll:
  1. fetch the detector's recent anomalies;
  2. drop ones already seen;
  3. keep the strongest new anomaly per client (one investigation per client per poll);
  4. skip clients investigated within ``auto_cooldown_seconds``;
  5. run the closed-loop workflow and remember the result.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import time
from collections import deque
from typing import Any, Callable, Protocol

from app.config import Settings
from app.models.schemas import AnomalyEvent, InvestigationResult

log = logging.getLogger("agent.autopilot")

_MAX_SEEN = 5000


class AnomalySource(Protocol):
    async def get_anomalies(self) -> list[dict[str, Any]]: ...


class Workflow(Protocol):
    async def run(self, anomaly: AnomalyEvent) -> InvestigationResult: ...


class AutoPilot:
    def __init__(self, source: AnomalySource, workflow: Workflow, settings: Settings,
                 clock: Callable[[], float] = time.time):
        self._source = source
        self._workflow = workflow
        self._s = settings
        self._clock = clock
        self._seen: set[str] = set()
        self._last_run: dict[str, float] = {}
        self.history: deque[dict[str, Any]] = deque(maxlen=settings.auto_history_size)
        self.polls = 0
        self.investigations = 0
        self.skipped_cooldown = 0
        self.errors = 0
        self.last_poll_at: float | None = None
        self.last_error: str | None = None

    @staticmethod
    def _key(raw: dict[str, Any]) -> str:
        return f"{raw.get('clientId')}|{raw.get('metric')}|{raw.get('timestamp')}"

    async def tick(self) -> list[dict[str, Any]]:
        """One poll. Returns the investigations run during this poll."""
        self.polls += 1
        self.last_poll_at = self._clock()
        events = await self._source.get_anomalies()

        # strongest new anomaly per client
        best: dict[str, dict[str, Any]] = {}
        for raw in events or []:
            key = self._key(raw)
            if key in self._seen or not raw.get("clientId"):
                continue
            self._seen.add(key)
            cid = raw["clientId"]
            if cid not in best or float(raw.get("deviation") or 0) > float(best[cid].get("deviation") or 0):
                best[cid] = raw
        if len(self._seen) > _MAX_SEEN:  # bound memory; old keys age out of the detector buffer anyway
            self._seen = set(list(self._seen)[-_MAX_SEEN // 2:])

        ran: list[dict[str, Any]] = []
        for cid, raw in best.items():
            now = self._clock()
            last = self._last_run.get(cid)
            if last is not None and now - last < self._s.auto_cooldown_seconds:
                self.skipped_cooldown += 1
                continue
            self._last_run[cid] = now
            anomaly = AnomalyEvent(
                clientId=cid,
                metric=str(raw.get("metric", "unknown")),
                currentValue=float(raw.get("currentValue") or 0),
                baseline=float(raw.get("baseline") or 0),
                deviation=float(raw.get("deviation") or 0),
                severity=str(raw.get("severity", "MEDIUM")),
                window=str(raw.get("window", "5m")),
                reason=str(raw.get("reason", "")),
                trigger=f"auto:{raw.get('metric', 'anomaly')}",
            )
            log.info("autopilot investigating client=%s metric=%s deviation=%.2f",
                     cid, anomaly.metric, anomaly.deviation)
            result = await self._workflow.run(anomaly)
            self.investigations += 1
            entry = {
                "id": result.action_id or "AUTO-" + hashlib.sha1(self._key(raw).encode()).hexdigest()[:10],
                "source": "AUTO",
                "startedAt": int(now * 1000),
                "anomaly": anomaly.model_dump(),
                "result": result.model_dump(),
            }
            self.history.appendleft(entry)
            ran.append(entry)
        return ran

    async def run_forever(self) -> None:
        log.info("autopilot on: polling every %.0fs, per-client cooldown %.0fs",
                 self._s.auto_poll_interval_seconds, self._s.auto_cooldown_seconds)
        while True:
            try:
                await self.tick()
            except asyncio.CancelledError:
                raise
            except Exception as e:  # gateway down etc. — never crash the loop
                self.errors += 1
                self.last_error = str(e)
                log.warning("autopilot poll failed: %s", e)
            await asyncio.sleep(self._s.auto_poll_interval_seconds)

    def status(self) -> dict[str, Any]:
        return {
            "enabled": self._s.auto_investigate,
            "pollIntervalSeconds": self._s.auto_poll_interval_seconds,
            "cooldownSeconds": self._s.auto_cooldown_seconds,
            "polls": self.polls,
            "investigations": self.investigations,
            "skippedCooldown": self.skipped_cooldown,
            "errors": self.errors,
            "lastPollAt": self.last_poll_at,
            "lastError": self.last_error,
        }
