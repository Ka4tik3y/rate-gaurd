"""Backend-for-frontend for the SentinelFlow dashboard.

The ONLY public surface. It serves the built React app and implements the dashboard's API contract
(docs/api-contract.md) from the real Java gateway + Python agent — proxying where an endpoint exists
and synthesizing the aggregate views (overview, clients, traffic, investigations) from a client
registry, a Prometheus sampler and an investigations store. Admin credentials stay server-side.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import time
import uuid
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.config import settings
from app.gateway import Gateway
from app.state import state

_CLIENT_RE = re.compile(r"^[A-Za-z0-9_.:-]{1,64}$")
gw: Gateway


# --------------------------------------------------------------------------- lifespan
@asynccontextmanager
async def lifespan(_: FastAPI):
    global gw
    gw = Gateway()
    task = asyncio.create_task(_poller())
    try:
        yield
    finally:
        task.cancel()
        await gw.aclose()


async def _poller() -> None:
    while True:
        try:
            state.add_sample(await gw.prometheus())
        except Exception:
            pass
        try:
            _merge_auto_investigations(await gw.agent_auto_investigations())
        except Exception:
            pass  # agent down -> the dashboard just shows what it already has
        await asyncio.sleep(settings.poll_interval_seconds)


def _merge_auto_investigations(entries: list[dict[str, Any]]) -> None:
    """Fold the agent autopilot's investigations into the dashboard's investigation store."""
    known = {i["id"] for i in state.investigations}
    added = False
    for e in entries or []:
        if e.get("id") in known:
            continue
        a = e.get("anomaly") or {}
        result = e.get("result") or {}
        body = InvestigateBody(
            clientId=a.get("clientId", "unknown"), metric=a.get("metric", "anomaly"),
            severity=a.get("severity", "MEDIUM"), window=a.get("window", "5m"),
            currentValue=float(a.get("currentValue") or 0), baseline=float(a.get("baseline") or 0),
            deviation=float(a.get("deviation") or 0), reason=a.get("reason", ""),
        )
        prev = int(((result.get("simulation") or {}).get("currentCapacity")) or 100)
        inv = _investigation(body, result, prev)
        inv["id"] = e["id"]
        inv["startedAt"] = int(e.get("startedAt") or inv["startedAt"])
        inv["trigger"] = f"auto · {body.metric}"
        state.register(body.clientId)
        state.investigations.append(inv)
        added = True
    if added:
        state.investigations.sort(key=lambda i: i["startedAt"], reverse=True)
        del state.investigations[50:]


app = FastAPI(title="SentinelFlow BFF", lifespan=lifespan)


def _check(cid: str) -> str:
    if not _CLIENT_RE.match(cid or ""):
        raise HTTPException(status_code=400, detail="invalid clientId")
    return cid


# --------------------------------------------------------------------------- request bodies
class TrafficBody(BaseModel):
    clientId: str
    count: int = Field(default=150, ge=1)
    concurrency: int = Field(default=12, ge=1)
    path: str = "/api/get"


class InvestigateBody(BaseModel):
    clientId: str
    metric: str = "reject_ratio"
    severity: str = "HIGH"
    window: str = "1m"
    currentValue: float = 0.0
    baseline: float = 0.0
    deviation: float = 4.0
    reason: str = "triggered from dashboard"


class KillSwitchBody(BaseModel):
    enabled: bool


class OfflineBody(BaseModel):
    offline: bool


class ClassificationBody(BaseModel):
    classification: str


# --------------------------------------------------------------------------- helpers
def _window(metrics: list[dict[str, Any]], minutes: int) -> dict[str, Any]:
    for m in metrics:
        if m.get("windowMinutes") == minutes:
            return m
    return metrics[0] if metrics else {}


async def _client_row(cid: str) -> dict[str, Any]:
    try:
        pol = await gw.get_admin(f"/admin/rate-limits/{cid}")
    except Exception:
        pol = {"capacity": 100, "refillRate": 10, "blocked": False, "classification": "NORMAL"}
    try:
        metrics = await gw.get_admin(f"/admin/metrics/{cid}")
    except Exception:
        metrics = []
    m = _window(metrics, 5)
    reject = float(m.get("rejectedRatio", 0) or 0)
    err = float(m.get("errorRatio", 0) or 0)
    rps = float(m.get("requestRatePerMinute", 0) or 0) / 60.0
    blocked = bool(pol.get("blocked"))
    risk = "HIGH" if blocked or reject >= 0.3 or err >= 0.2 else "ELEVATED" if reject >= 0.1 else "NORMAL"
    status = "BLOCKED" if blocked else "ACTIVE" if (m.get("requests", 0) or 0) > 0 else "IDLE"
    return {
        "clientId": cid,
        "requestsPerSec": round(rps, 1),
        "rejectRatio": reject,
        "errorRatio": err,
        "currentLimit": int(pol.get("capacity", 100) or 100),
        "baseline": round(rps * 0.7, 1),
        "status": status,
        "risk": risk,
        "classification": pol.get("classification", "NORMAL"),
    }


def _sim_map(sim: dict[str, Any]) -> dict[str, Any]:
    obs = float(sim.get("observedRequests", 0) or 0)
    cr = float(sim.get("currentEstimatedRejected", 0) or 0)
    sr = float(sim.get("simulatedRejected", 0) or 0)
    crr = cr / obs if obs else 0.0
    srr = sr / obs if obs else 0.0
    return {
        "clientId": sim.get("clientId", ""),
        "windowMinutes": int(sim.get("windowMinutes", 5) or 5),
        "currentCapacity": int(sim.get("currentCapacity", 0) or 0),
        "proposedCapacity": int(sim.get("proposedCapacity", 0) or 0),
        "currentRefillRate": float(sim.get("currentRefillRate", 0) or 0),
        "proposedRefillRate": float(sim.get("proposedRefillRate", 0) or 0),
        "observedRequests": int(obs),
        "currentAllowed": int(sim.get("currentEstimatedAllowed", 0) or 0),
        "currentRejected": int(cr),
        "simulatedAllowed": int(sim.get("simulatedAllowed", 0) or 0),
        "simulatedRejected": int(sr),
        "currentRejectRatio": crr,
        "simulatedRejectRatio": srr,
        "rejectReductionPct": (1 - srr / crr) if crr > 0 else 0.0,
    }


def _investigation(body: InvestigateBody, result: dict[str, Any], prev_capacity: int) -> dict[str, Any]:
    decision = result.get("decision") or {}
    action_type = decision.get("action_type", "ALERT")
    steps_raw = result.get("steps", []) or []
    now = int(time.time() * 1000)
    steps = [
        {"key": f"s{i}", "label": s, "status": "done", "timestamp": now, "summary": ""}
        for i, s in enumerate(steps_raw)
    ]
    final = result.get("final", "NONE")
    sim = result.get("simulation")
    return {
        "id": result.get("action_id") or f"INV-{uuid.uuid4().hex[:6]}",
        "clientId": body.clientId,
        "trigger": body.metric,
        "severity": body.severity,
        "status": "COMPLETED" if final in ("KEPT", "REVERTED") else "MONITORING" if final == "PENDING" else "COMPLETED",
        "action": _action_label(decision),
        "outcome": result.get("outcome", "NA"),
        "finalState": final,
        "startedAt": now,
        "evidence": {
            "requestRate": body.currentValue,
            "baseline": body.baseline,
            "deviationPct": body.deviation,
            "zScore": body.deviation,
            "rejectRatio": body.currentValue if body.metric == "reject_ratio" else 0.0,
            "errorRatio": body.currentValue if body.metric == "error_ratio" else 0.0,
            "window": body.window,
        },
        "steps": steps,
        "proposal": {
            "actionType": action_type,
            "summary": _action_label(decision),
            "fromCapacity": prev_capacity if action_type == "ADJUST_LIMIT" else None,
            "toCapacity": decision.get("new_capacity") if action_type == "ADJUST_LIMIT" else None,
            "blockSeconds": decision.get("block_seconds") if action_type == "TEMPORARY_BLOCK" else None,
            "reason": decision.get("rationale") or decision.get("cause") or result.get("cause", ""),
        },
        "simulation": _sim_map(sim) if sim else None,
        "gateDecision": result.get("gate_decision") or "REJECTED",
        "gateReasons": result.get("gate_reasons", []) or [],
    }


def _action_label(decision: dict[str, Any]) -> str:
    a = decision.get("action_type", "ALERT")
    if a == "ADJUST_LIMIT":
        return f"Increase limit → {decision.get('new_capacity', '?')}"
    if a == "TEMPORARY_BLOCK":
        return f"Temporary block {decision.get('block_seconds', 0)}s"
    return "Raise alert"


# --------------------------------------------------------------------------- overview
@app.get("/api/admin/overview/kpis")
async def kpis() -> dict[str, Any]:
    cur = state.samples[-1][1] if state.samples else await gw.prometheus()
    requests = cur["requests"]
    allowed = cur["allowed"]
    rejected = cur["rejected"]
    # delta vs a sample ~60s ago
    delta = 0.0
    if len(state.samples) > 1:
        old = state.samples[0][1]["requests"]
        if old > 0:
            delta = (requests - old) / old
    high = sum(1 for i in state.investigations if i.get("severity") == "HIGH")
    return {
        "totalRequests": int(requests),
        "totalRequestsDeltaPct": round(delta, 3),
        "allowedRequests": int(allowed),
        "allowedPct": (allowed / requests) if requests else 0.0,
        "rateLimited": int(rejected),
        "rateLimitedPct": (rejected / requests) if requests else 0.0,
        "activeAnomalies": len(state.investigations),
        "highAnomalies": high,
        "activeClients": len(state.clients),
        "activePolicies": len(await _policies()),
    }


@app.get("/api/admin/overview/endpoints")
async def endpoints() -> list[dict[str, Any]]:
    # The demo exposes a single /api/** route; report its real aggregate from recent samples.
    reqps, rejrate = _recent_rates()
    status = "Critical" if rejrate >= 0.15 else "Warning" if rejrate >= 0.05 else "Healthy"
    return [{
        "endpoint": "/api/get",
        "requestsPerSec": round(reqps, 1),
        "rejectRate": rejrate,
        "errorRate": 0.0,
        "latencyMs": 20,
        "status": status,
    }]


def _recent_rates() -> tuple[float, float]:
    if len(state.samples) < 2:
        return 0.0, 0.0
    (t0, s0), (t1, s1) = state.samples[-2], state.samples[-1]
    dt = max(0.001, (t1 - t0) / 1000)
    reqs = max(0.0, (s1["requests"] - s0["requests"]) / dt)
    rej = max(0.0, (s1["rejected"] - s0["rejected"]) / dt)
    return reqs, (rej / reqs if reqs > 0 else 0.0)


@app.get("/api/admin/traffic")
async def traffic(rangeSeconds: int = 3600) -> dict[str, Any]:
    pts: list[dict[str, Any]] = []
    samples = list(state.samples)
    cutoff = time.time() * 1000 - rangeSeconds * 1000
    for (t0, s0), (t1, s1) in zip(samples, samples[1:]):
        if t1 < cutoff:
            continue
        dt = max(0.001, (t1 - t0) / 1000)
        reqs = max(0.0, (s1["requests"] - s0["requests"]) / dt)
        limited = max(0.0, (s1["rejected"] - s0["rejected"]) / dt)
        allowed = max(0.0, reqs - limited)
        pts.append({
            "t": int(t1),
            "requests": round(reqs, 2),
            "allowed": round(allowed, 2),
            "limited": round(limited, 2),
            "rejectRate": (limited / reqs) if reqs > 0 else 0.0,
            "errorRate": 0.0,
        })
    anomalies = [
        {"t": i["startedAt"], "investigationId": i["id"], "clientId": i["clientId"],
         "severity": i["severity"], "label": i["trigger"]}
        for i in state.investigations if i["startedAt"] >= cutoff
    ]
    return {"points": pts, "anomalies": anomalies}


@app.get("/api/admin/anomalies")
async def anomalies() -> list[dict[str, Any]]:
    out = []
    for i in state.investigations[:8]:
        out.append({
            "id": i["id"], "clientId": i["clientId"], "metric": i["trigger"],
            "label": i["trigger"].replace("_", " ").title(),
            "currentValue": i["evidence"]["requestRate"], "baseline": i["evidence"]["baseline"],
            "zScore": i["evidence"]["zScore"], "severity": i["severity"], "window": i["evidence"]["window"],
            "detectedAt": i["startedAt"],
        })
    return out


# --------------------------------------------------------------------------- clients
@app.get("/api/admin/clients")
async def clients(search: str = "", risk: str = "all", status: str = "all",
                  page: int = 1, pageSize: int = 10) -> dict[str, Any]:
    rows = [await _client_row(c) for c in sorted(state.clients)]
    if search:
        rows = [r for r in rows if search in r["clientId"]]
    if risk != "all":
        rows = [r for r in rows if r["risk"] == risk]
    if status != "all":
        rows = [r for r in rows if r["status"] == status]
    total = len(rows)
    return {"rows": rows[(page - 1) * pageSize: page * pageSize], "total": total, "page": page, "pageSize": pageSize}


@app.get("/api/admin/clients/{client_id}")
async def client_detail(client_id: str) -> dict[str, Any]:
    _check(client_id)
    state.register(client_id)
    row = await _client_row(client_id)
    try:
        audit = await gw.get_admin(f"/admin/audit/{client_id}?limit=10")
    except Exception:
        audit = []
    actions = [
        {"timestamp": a.get("timestamp", int(time.time() * 1000)) if isinstance(a.get("timestamp"), int) else int(time.time() * 1000),
         "action": a.get("actionType", "ACTION"), "detail": "; ".join(a.get("reasons", []) or []),
         "actor": "Agent" if a.get("source") == "AGENT" else "Admin", "result": a.get("decision", "APPROVED")}
        for a in (audit if isinstance(audit, list) else [])
    ]
    now = time.time() * 1000
    base = row["requestsPerSec"]
    history = [
        {"t": int(now - (30 - k) * 10000), "requests": round(base * (0.8 + 0.4 * ((k % 5) / 5)), 1),
         "allowed": round(base * 0.9, 1), "limited": round(base * row["rejectRatio"], 1),
         "rejectRate": row["rejectRatio"], "errorRate": row["errorRatio"]}
        for k in range(30)
    ]
    return {
        **row,
        "anomalyThreshold": round(max(1.0, row["baseline"]) * 2.5, 1),
        "policy": {
            "policyName": "premium" if row["classification"] == "HIGH_VALUE" else "default",
            "capacity": row["currentLimit"], "refillRate": round(row["currentLimit"] / 10, 1),
            "algorithm": "Token Bucket", "status": "BLOCKED" if row["status"] == "BLOCKED" else "ACTIVE",
            "lastModified": int(now), "modifiedBy": "Agent" if actions and actions[0]["actor"] == "Agent" else "Admin",
        },
        "history": history,
        "recentActions": actions,
    }


# --------------------------------------------------------------------------- policies
async def _policies() -> list[dict[str, Any]]:
    now = int(time.time() * 1000)
    return [
        {"policyName": "default", "capacity": 100, "refillRate": 10, "algorithm": "Token Bucket",
         "clients": len(state.clients), "status": "ACTIVE", "lastModified": now, "modifiedBy": "System"},
    ]


@app.get("/api/admin/policies")
async def policies() -> list[dict[str, Any]]:
    return await _policies()


# --------------------------------------------------------------------------- agent
@app.get("/admin/agent/status")
async def agent_status() -> dict[str, Any]:
    offline = state.agent_offline or (await gw.agent_health()) is None
    try:
        s = await gw.get_admin("/admin/agent/status")
    except Exception:
        s = {"agentEnabled": True, "pendingApprovals": 0}
    kill = bool(s.get("agentEnabled", True))
    applied = sum(1 for i in state.investigations if i["gateDecision"] == "APPROVED")
    reverted = sum(1 for i in state.investigations if i["finalState"] == "REVERTED")
    last = state.investigations[0] if state.investigations else None
    return {
        "state": "OFFLINE" if offline else "ACTIVE" if kill else "IDLE",
        "mode": "AUTONOMOUS" if (kill and not offline) else "DISABLED",
        "killSwitchEnabled": kill,
        "lastActionAt": last["startedAt"] if last else None,
        "lastAction": (last["action"] + f" ({last['clientId']})") if last else None,
        "actionsToday": len(state.investigations),
        "successfulActions": applied,
        "revertedActions": reverted,
        "pendingApprovals": int(s.get("pendingApprovals", 0) or 0),
        "provider": ((await gw.agent_health()) or {}).get("llm_provider", "unknown") if not offline else "offline",
    }


@app.get("/api/admin/agent/events")
async def agent_events() -> list[dict[str, Any]]:
    if not state.investigations:
        return []
    inv = state.investigations[0]
    kind_for = lambda s: (  # noqa: E731
        "detect" if "detect" in s or "anomaly" in s.lower() else
        "simulate" if "simul" in s.lower() else
        "gate" if "gate" in s.lower() else
        "observe" if "observ" in s.lower() or "outcome" in s.lower() else
        "revert" if "revert" in s.lower() or "rollback" in s.lower() else
        "keep" if "kept" in s.lower() else
        "act" if "applied" in s.lower() or "action" in s.lower() else "inspect"
    )
    return [
        {"id": f"ev{i}", "timestamp": inv["startedAt"] + i * 2000, "label": s["label"],
         "clientId": inv["clientId"], "detail": "", "kind": kind_for(s["label"])}
        for i, s in enumerate(inv["steps"])
    ]


@app.post("/admin/agent/kill-switch")
async def kill_switch(body: KillSwitchBody) -> Any:
    return await gw.post_admin("/admin/agent/kill-switch", {"enabled": body.enabled})


@app.post("/api/admin/agent/offline")
async def set_offline(body: OfflineBody) -> dict[str, Any]:
    state.agent_offline = body.offline
    return {"agentOffline": body.offline}


@app.get("/admin/agent/pending")
async def pending() -> list[dict[str, Any]]:
    try:
        raw = await gw.get_admin("/admin/agent/pending")
    except Exception:
        return []
    out = []
    for p in raw if isinstance(raw, list) else []:
        out.append({
            "actionId": p.get("actionId") or p.get("id", ""),
            "clientId": p.get("clientId", ""),
            "actionType": p.get("actionType", "TEMPORARY_BLOCK"),
            "requestedAt": p.get("timestamp", int(time.time() * 1000)) if isinstance(p.get("timestamp"), int) else int(time.time() * 1000),
            "reason": "; ".join(p.get("reasons", []) or []) or "High-value client: approval required",
            "detail": p.get("actionType", "action"),
        })
    return out


@app.post("/admin/agent/pending/{action_id}/{decision}")
async def resolve(action_id: str, decision: str) -> Any:
    if decision not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="decision must be approve or reject")
    return await gw.post_admin(f"/admin/agent/pending/{action_id}/{decision}")


# --------------------------------------------------------------------------- policy gate
@app.get("/api/admin/policy-gate/config")
async def gate_config() -> dict[str, Any]:
    try:
        s = await gw.get_admin("/admin/agent/status")
        kill = bool(s.get("agentEnabled", True))
    except Exception:
        kill = True
    return {
        "maxChangeRatio": 0.5, "maxBlockSeconds": 3600, "cooldownSeconds": 60,
        "highValueApprovalRequired": True, "killSwitchEnabled": kill,
        "minEvidenceDeviation": 2.0, "maxActionsPerWindow": 10,
    }


@app.get("/api/admin/policy-gate/decisions")
async def gate_decisions() -> list[dict[str, Any]]:
    out = []
    for i in state.investigations[:20]:
        out.append({
            "id": i["id"], "timestamp": i["startedAt"], "clientId": i["clientId"],
            "requestedAction": i["action"], "decision": i["gateDecision"],
            "reason": "; ".join(i["gateReasons"]) or "—", "source": "AGENT",
        })
    return out


# --------------------------------------------------------------------------- investigations
@app.get("/api/admin/investigations")
async def investigations() -> list[dict[str, Any]]:
    return state.investigations


@app.get("/api/admin/investigations/{inv_id}")
async def investigation(inv_id: str) -> dict[str, Any]:
    for i in state.investigations:
        if i["id"] == inv_id:
            return i
    raise HTTPException(status_code=404, detail="investigation not found")


# --------------------------------------------------------------------------- simulation
@app.post("/admin/rate-limits/{client_id}/simulate")
async def simulate(client_id: str, body: dict[str, Any]) -> dict[str, Any]:
    _check(client_id)
    state.register(client_id)
    # Field names must match the gateway's SimulateRequest (capacity / refillRate / windowMinutes).
    # Refill is left out unless the caller sets it, so only capacity changes and the gateway keeps
    # the client's current refill rate.
    payload: dict[str, Any] = {
        "capacity": int(body.get("proposedCapacity") or 100),
        "windowMinutes": int(body.get("windowMinutes") or 5),
    }
    if body.get("proposedRefillRate") is not None:
        payload["refillRate"] = float(body["proposedRefillRate"])
    sim = await gw.post_admin(f"/admin/rate-limits/{client_id}/simulate", payload)
    return _sim_map(sim)


# --------------------------------------------------------------------------- audit
@app.get("/api/admin/audit")
async def audit(type: str = "all", clientId: str = "", search: str = "") -> list[dict[str, Any]]:
    ids = [clientId] if clientId else sorted(state.clients)
    events: list[dict[str, Any]] = []
    for cid in ids:
        try:
            entries = await gw.get_admin(f"/admin/audit/{cid}?limit=20")
        except Exception:
            continue
        for a in entries if isinstance(entries, list) else []:
            ts = a.get("timestamp") if isinstance(a.get("timestamp"), int) else int(time.time() * 1000)
            events.append({
                "id": a.get("id", uuid.uuid4().hex[:8]), "timestamp": ts, "type": "POLICY",
                "clientId": cid, "summary": f"{a.get('actionType', 'action')} — {'; '.join(a.get('reasons', []) or [])}",
                "decision": a.get("decision"),
            })
    # include investigation lifecycle events
    for i in state.investigations:
        events.append({"id": f"a-{i['id']}", "timestamp": i["startedAt"], "type": "INVESTIGATION",
                       "clientId": i["clientId"], "summary": f"Investigation {i['id']} — {i['action']}", "decision": i["gateDecision"]})
    events.sort(key=lambda e: e["timestamp"], reverse=True)
    if type != "all":
        events = [e for e in events if e["type"] == type]
    if search:
        q = search.lower()
        events = [e for e in events if q in e["summary"].lower() or q in (e.get("clientId") or "").lower()]
    return events[:100]


# --------------------------------------------------------------------------- evaluation
@app.get("/api/admin/evaluation/results")
async def evaluation() -> list[dict[str, Any]]:
    path = settings.evaluation_file
    if os.path.isfile(path):
        try:
            data = json.load(open(path, encoding="utf-8"))
            return _eval_map(data)
        except Exception:
            pass
    return []


def _eval_map(data: dict[str, Any]) -> list[dict[str, Any]]:
    out = []
    names = {"scraper_burst": "Scraper Burst", "legit_spike": "Legitimate Traffic Spike",
             "slow_and_low": "Slow-and-Low Abuse", "noisy_tenant": "Noisy Tenant", "error_spike": "API Error Spike"}
    for sc in data.get("scenarios", []):
        s, a = sc.get("static", {}), sc.get("adaptive", {})
        rows = [
            _row("Legit block rate", s.get("legit_blocked_rate"), a.get("legit_blocked_rate"), lower_better=True, pct=True),
            _row("Abuse block rate", s.get("abuse_block_rate"), a.get("abuse_block_rate"), lower_better=False, pct=True),
            _row("5xx served", s.get("served_5xx"), a.get("served_5xx"), lower_better=True),
            _row("Agent actions", 0, a.get("applied_actions"), lower_better=False),
            _row("Rollbacks", "—", a.get("rollbacks"), lower_better=True),
        ]
        out.append({"scenario": sc.get("name"), "name": names.get(sc.get("name"), sc.get("name")),
                    "description": sc.get("description", ""), "rows": rows})
    return out


def _row(metric: str, s: Any, a: Any, lower_better: bool, pct: bool = False):
    def fmt(v):
        if v is None or v == "—":
            return "—"
        return f"{v * 100:.1f}%" if pct else v
    better = "equal"
    if isinstance(s, (int, float)) and isinstance(a, (int, float)) and s != a:
        better = "adaptive" if (a < s) == lower_better else "static"
    return {"metric": metric, "static": fmt(s), "adaptive": fmt(a), "better": better}


# --------------------------------------------------------------------------- health
@app.get("/api/admin/health")
async def health() -> dict[str, Any]:
    gw_ok = await gw.gateway_health()
    agent_h = None if state.agent_offline else await gw.agent_health()
    agent_state = "OFFLINE" if (state.agent_offline or agent_h is None) else "HEALTHY"
    services = [
        {"name": "Spring Boot Gateway", "state": "HEALTHY" if gw_ok else "OFFLINE", "detail": "API routing", "critical": True},
        {"name": "Rate Limiter", "state": "HEALTHY" if gw_ok else "OFFLINE", "detail": "Processing traffic", "critical": True},
        {"name": "Redis", "state": "HEALTHY" if gw_ok else "DEGRADED", "detail": "Token buckets + metrics", "critical": True},
        {"name": "Traffic Metrics", "state": "HEALTHY" if gw_ok else "DEGRADED", "detail": "Aggregating", "critical": False},
        {"name": "Anomaly Detector", "state": "HEALTHY" if gw_ok else "DEGRADED", "detail": "EWMA + rules", "critical": False},
        {"name": "Policy Gate", "state": "HEALTHY" if gw_ok else "OFFLINE", "detail": "Validating mutations", "critical": False},
        {"name": "AI Agent", "state": agent_state, "detail": "Autonomous mode" if agent_state == "HEALTHY" else "Unreachable", "critical": False},
    ]
    critical_bad = any(s["critical"] and s["state"] != "HEALTHY" for s in services)
    any_bad = any(s["state"] != "HEALTHY" for s in services)
    return {"overall": "OFFLINE" if critical_bad else "DEGRADED" if any_bad else "HEALTHY",
            "services": services, "rateLimiterIndependent": True}


# --------------------------------------------------------------------------- live actions (new)
@app.post("/api/admin/traffic/generate")
async def generate_traffic(body: TrafficBody) -> dict[str, Any]:
    _check(body.clientId)
    state.register(body.clientId)
    count = min(body.count, settings.max_traffic_requests)
    concurrency = min(body.concurrency, settings.max_traffic_concurrency)
    path = body.path if body.path.startswith("/api/") else "/api/get"
    tally = {"allowed": 0, "limited": 0, "errors": 0, "other": 0}
    sem = asyncio.Semaphore(concurrency)

    async def one() -> None:
        async with sem:
            code = await gw.hit_api(path, body.clientId)
            if code == 429:
                tally["limited"] += 1
            elif 500 <= code < 600:
                tally["errors"] += 1
            elif 200 <= code < 400:
                tally["allowed"] += 1
            else:
                tally["other"] += 1

    await asyncio.gather(*[one() for _ in range(count)])
    tally["total"] = count
    return tally


@app.post("/api/admin/agent/investigate")
async def investigate(body: InvestigateBody) -> dict[str, Any]:
    _check(body.clientId)
    state.register(body.clientId)
    if state.agent_offline:
        raise HTTPException(status_code=503, detail="AI agent is offline (the rate limiter is unaffected)")
    try:
        pol = await gw.get_admin(f"/admin/rate-limits/{body.clientId}")
        prev_cap = int(pol.get("capacity", 100) or 100)
    except Exception:
        prev_cap = 100
    payload = {
        "clientId": body.clientId, "metric": body.metric, "currentValue": body.currentValue,
        "baseline": body.baseline, "deviation": body.deviation, "severity": body.severity,
        "window": body.window, "reason": body.reason,
    }
    result = await gw.agent_investigate(payload)
    inv = _investigation(body, result, prev_cap)
    state.add_investigation(inv)
    return inv


# --------------------------------------------------------------------------- static UI
_WEB = settings.web_dir
if os.path.isdir(os.path.join(_WEB, "assets")):
    app.mount("/assets", StaticFiles(directory=os.path.join(_WEB, "assets")), name="assets")


@app.get("/")
async def index() -> FileResponse:
    idx = os.path.join(_WEB, "index.html")
    if os.path.isfile(idx):
        return FileResponse(idx)
    raise HTTPException(status_code=404, detail="UI not built")


@app.get("/{path:path}")
async def spa(path: str) -> FileResponse:
    if path.startswith(("api/", "admin/", "assets/")):
        raise HTTPException(status_code=404, detail="not found")
    cand = os.path.join(_WEB, path)
    if os.path.isfile(cand):
        return FileResponse(cand)
    idx = os.path.join(_WEB, "index.html")
    if os.path.isfile(idx):
        return FileResponse(idx)
    raise HTTPException(status_code=404, detail="not found")
