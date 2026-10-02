"""Faithful offline models of the production pipeline pieces (spec §29).

Everything here mirrors the Java implementation so the evaluation is honest:

* ``TokenBucket``      mirrors ``token_bucket.lua`` (refill to capacity, consume one token).
* ``aggregate_window`` mirrors ``MetricsAggregator`` / ``WindowMetrics`` (per-minute buckets,
  429 ratio, 5xx ratio, burstiness = peak-minute / mean-minute, unique endpoints).
* ``Detector``         mirrors the EWMA/z-score baseline detector + ``AnomalyRules`` thresholds.
* ``SimGate``          mirrors ``PolicyGate`` guardrails (evidence, ±ratio, bounds, cooldown,
  action-rate cap, high-value approval).

Default thresholds equal the Java defaults (application.yml), so adaptive behaviour in the
harness matches what the real stack would do. Nothing here hard-codes an outcome.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional


# ----------------------------------------------------------------------------- traffic
@dataclass
class Request:
    """One client request on the simulated timeline."""
    t: float                     # seconds since scenario start
    client_id: str
    endpoint: str = "/api/get"
    server_error: bool = False   # would the downstream return 5xx (only if the request is allowed)
    legitimate: bool = True      # ground-truth label, used only for scoring (not visible to the agent)


@dataclass
class Outcome:
    t: float
    client_id: str
    endpoint: str
    allowed: bool
    error: bool                  # a 5xx actually served (allowed AND server_error)
    legitimate: bool


# ----------------------------------------------------------------------------- token bucket
@dataclass
class TokenBucket:
    """Mirrors the Lua token bucket: refill at ``refill_rate``/s up to ``capacity``, consume 1."""
    capacity: float
    refill_rate: float
    tokens: float = field(default=None)  # type: ignore[assignment]
    last_t: float = 0.0

    def __post_init__(self) -> None:
        if self.tokens is None:
            self.tokens = float(self.capacity)

    def allow(self, t: float) -> bool:
        elapsed = max(0.0, t - self.last_t)
        self.tokens = min(self.capacity, self.tokens + elapsed * self.refill_rate)
        self.last_t = t
        if self.tokens >= 1.0:
            self.tokens -= 1.0
            return True
        return False

    def reconfigure(self, capacity: float, refill_rate: float) -> None:
        self.capacity = float(capacity)
        self.refill_rate = float(refill_rate)
        self.tokens = min(self.tokens, self.capacity)


# ----------------------------------------------------------------------------- thresholds
@dataclass
class EngineSettings:
    """Detector + gate thresholds. Defaults equal the Java application.yml defaults."""
    window_seconds: int = 60
    # EWMA / z-score baseline detector (request rate)
    ewma_alpha: float = 0.2
    z_threshold: float = 3.0
    warmup_samples: int = 5
    # absolute threshold rules
    min_requests_for_ratio: int = 20
    reject_ratio_threshold: float = 0.5
    error_ratio_threshold: float = 0.2
    burstiness_threshold: float = 3.0
    slow_low_max_rate_per_minute: float = 5.0
    slow_low_min_endpoints: int = 15
    # Policy Gate
    min_evidence_deviation: float = 2.0
    max_change_ratio: float = 0.5
    min_capacity: int = 1
    max_capacity: int = 100_000
    max_block_seconds: int = 3600
    cooldown_seconds: int = 60
    max_actions_per_window: int = 10
    action_window_seconds: int = 3600


# ----------------------------------------------------------------------------- aggregation
def aggregate_window(outcomes: list[Outcome], window_minutes: float) -> dict:
    """Aggregate a client's outcomes into one WindowMetrics-shaped dict (mirrors Java)."""
    n = len(outcomes)
    if n == 0 or window_minutes <= 0:
        return {"requests": 0, "rejected": 0, "errors": 0, "rejectedRatio": 0.0,
                "errorRatio": 0.0, "requestRatePerMinute": 0.0, "uniqueEndpoints": 0,
                "burstiness": 0.0, "windowMinutes": window_minutes}
    rejected = sum(1 for o in outcomes if not o.allowed)
    errors = sum(1 for o in outcomes if o.error)
    endpoints = {o.endpoint for o in outcomes}
    # burstiness = peak-minute count / mean-minute count over the window's minute buckets
    minutes = max(1, int(math.ceil(window_minutes)))
    start = min(o.t for o in outcomes)
    buckets = [0] * minutes
    for o in outcomes:
        idx = min(minutes - 1, int((o.t - start) // 60))
        buckets[idx] += 1
    peak = max(buckets)
    mean = sum(buckets) / minutes
    burstiness = (peak / mean) if mean > 0 else 0.0
    return {
        "requests": n,
        "rejected": rejected,
        "errors": errors,
        "rejectedRatio": rejected / n,
        "errorRatio": errors / n,
        "requestRatePerMinute": n / window_minutes,
        "uniqueEndpoints": len(endpoints),
        "burstiness": burstiness,
        "windowMinutes": window_minutes,
    }


# ----------------------------------------------------------------------------- detector
@dataclass
class _Baseline:
    mean: float = 0.0
    var: float = 0.0
    samples: int = 0

    def update(self, value: float, alpha: float) -> None:
        if self.samples == 0:
            self.mean = value
            self.var = 0.0
        else:
            diff = value - self.mean
            self.mean += alpha * diff
            self.var = (1 - alpha) * (self.var + alpha * diff * diff)
        self.samples += 1

    def zscore(self, value: float) -> float:
        std = math.sqrt(self.var)
        if std < 1e-9:
            return 0.0
        return (value - self.mean) / std


@dataclass
class DetectedAnomaly:
    metric: str
    current_value: float
    baseline: float
    deviation: float
    severity: str
    window: str
    reason: str
    metrics: dict = field(default_factory=dict)   # the window snapshot this fired on


class Detector:
    """Deterministic detector: EWMA/z-score for request-rate spikes + absolute threshold rules.

    Mirrors Phase 2. It evaluates several windows (like the Java sweep over 1/5/10m) and each
    anomaly carries the window snapshot it fired on, so the planner reasons on that same window
    (the Phase 4 window-selection fix). Evidence ``deviation`` is the z-score for the baseline
    rule and ``value / threshold`` for the absolute rules, so the Policy Gate's evidence check
    (``deviation >= min_evidence_deviation``) is applied on a consistent, meaningful scale.
    """

    def __init__(self, s: EngineSettings):
        self._s = s
        self._baselines: dict[str, _Baseline] = {}

    def evaluate(self, client_id: str, windows: dict[int, dict], ewma_window: int) -> list[DetectedAnomaly]:
        s = self._s
        events: list[DetectedAnomaly] = []

        # EWMA / z-score baseline on the request rate of the configured evaluation window.
        em = windows.get(ewma_window)
        if em is not None:
            rate = em["requestRatePerMinute"]
            bl = self._baselines.setdefault(client_id, _Baseline())
            if bl.samples >= s.warmup_samples:
                z = bl.zscore(rate)
                if z >= s.z_threshold:
                    sev = "HIGH" if z >= 2 * s.z_threshold else "MEDIUM"
                    events.append(DetectedAnomaly("request_rate", rate, bl.mean, z, sev,
                                  f"{ewma_window}m",
                                  f"request rate {rate:.0f}/min is z={z:.1f} above baseline {bl.mean:.0f}",
                                  em))
            bl.update(rate, s.ewma_alpha)

        # Absolute threshold rules on every provided window; keep the strongest per metric.
        best: dict[str, DetectedAnomaly] = {}
        for minutes, m in windows.items():
            window = f"{minutes}m"
            enough = m["requests"] >= s.min_requests_for_ratio
            rate = m["requestRatePerMinute"]
            if enough and m["rejectedRatio"] >= s.reject_ratio_threshold:
                dev = m["rejectedRatio"] / s.reject_ratio_threshold
                _keep(best, DetectedAnomaly("reject_ratio", m["rejectedRatio"], s.reject_ratio_threshold,
                      dev, _sev(dev), window, f"429 ratio {m['rejectedRatio']*100:.0f}% over {window}", m))
            if enough and m["errorRatio"] >= s.error_ratio_threshold:
                dev = m["errorRatio"] / s.error_ratio_threshold
                _keep(best, DetectedAnomaly("error_ratio", m["errorRatio"], s.error_ratio_threshold,
                      dev, _sev(dev), window, f"5xx ratio {m['errorRatio']*100:.0f}% over {window}", m))
            if m["burstiness"] >= s.burstiness_threshold:
                dev = m["burstiness"] / s.burstiness_threshold
                _keep(best, DetectedAnomaly("burstiness", m["burstiness"], s.burstiness_threshold,
                      dev, _sev(dev), window, f"burstiness {m['burstiness']:.1f} over {window}", m))
            if 0 < rate <= s.slow_low_max_rate_per_minute and m["uniqueEndpoints"] >= s.slow_low_min_endpoints:
                dev = m["uniqueEndpoints"] / s.slow_low_min_endpoints
                _keep(best, DetectedAnomaly("slow_and_low", m["uniqueEndpoints"], s.slow_low_min_endpoints,
                      dev, "MEDIUM", window,
                      f"slow-and-low: {rate:.1f} req/min but {m['uniqueEndpoints']} endpoints", m))
        events.extend(best.values())
        return events


def _keep(best: dict, a: DetectedAnomaly) -> None:
    cur = best.get(a.metric)
    if cur is None or a.deviation > cur.deviation:
        best[a.metric] = a


def _sev(deviation: float) -> str:
    return "HIGH" if deviation >= 4.0 else "MEDIUM"


# ----------------------------------------------------------------------------- sim gate
@dataclass
class GateResult:
    decision: str                  # APPROVED | REJECTED | PENDING_APPROVAL
    reasons: list[str] = field(default_factory=list)


class SimGate:
    """Mirrors the Java Policy Gate guardrails for the adaptive arm (spec §21–24)."""

    def __init__(self, s: EngineSettings):
        self._s = s
        self._last_action_t: dict[str, float] = {}
        self._action_times: dict[str, list[float]] = {}

    def evaluate(self, t: float, action_type: str, client_id: str, classification: str,
                 current_capacity: float, new_capacity: Optional[float],
                 deviation: float) -> GateResult:
        s = self._s
        # ALERT never mutates — always allowed.
        if action_type == "ALERT":
            return GateResult("APPROVED", ["alert"])
        # evidence threshold (agent mutations only)
        if deviation < s.min_evidence_deviation:
            return GateResult("REJECTED", [f"insufficient evidence: deviation {deviation:.2f} < {s.min_evidence_deviation}"])
        # cooldown
        last = self._last_action_t.get(client_id)
        if last is not None and (t - last) < s.cooldown_seconds:
            return GateResult("REJECTED", ["cooldown active"])
        # action-rate cap
        times = [x for x in self._action_times.get(client_id, []) if t - x < s.action_window_seconds]
        if len(times) >= s.max_actions_per_window:
            return GateResult("REJECTED", ["max actions per window exceeded"])
        if action_type == "ADJUST_LIMIT":
            if new_capacity is None:
                return GateResult("REJECTED", ["no capacity"])
            if not (s.min_capacity <= new_capacity <= s.max_capacity):
                return GateResult("REJECTED", ["capacity out of absolute bounds"])
            ratio = abs(new_capacity / current_capacity - 1.0) if current_capacity else 1.0
            if ratio > s.max_change_ratio + 1e-9:
                return GateResult("REJECTED", [f"change {ratio:.0%} exceeds ±{s.max_change_ratio:.0%}"])
        elif action_type == "TEMPORARY_BLOCK":
            if classification == "HIGH_VALUE":
                return GateResult("PENDING_APPROVAL", ["high-value client: block requires human approval"])
        return GateResult("APPROVED", ["applied"])

    def record_applied(self, t: float, client_id: str) -> None:
        self._last_action_t[client_id] = t
        self._action_times.setdefault(client_id, []).append(t)
