"""The five evaluation traffic scenarios (spec §32).

Each scenario is deterministic (no randomness) so results are reproducible. Clients that need
a request-rate baseline send *varied* normal traffic during the warm-up window (real traffic is
never perfectly flat, and a flat baseline has zero variance so no z-score can form). The anomaly
begins at ``ONSET``. Ground-truth ``abusive`` / ``legitimate`` labels are used only for scoring —
the agent never sees them.

Timeline: 60s detector step, 5- and 10-minute evaluation windows, EWMA warm-up of 5 samples that
only begins once a full window exists (t≥300s). So t=300–600s is clean baseline and the anomaly
starts at ONSET=600s, running to END=1680s (28 simulated minutes — free in an offline model).
Bucket defaults mirror the project defaults (capacity 100, refill 10/s).
"""
from __future__ import annotations

from dataclasses import dataclass, field

from app.simulation.engine import Request

ONSET = 600.0
END = 1680.0
CAP = 100
REFILL = 10.0


@dataclass
class Scenario:
    name: str
    description: str
    requests: list[Request]
    abusive: set[str] = field(default_factory=set)
    high_value: set[str] = field(default_factory=set)
    onset_seconds: float = ONSET
    duration_seconds: float = END
    static_capacity: int = CAP
    static_refill: float = REFILL
    expected: str = ""


def _emit(client: str, minute_counts: list[int], start_minute: int = 0, *,
          endpoint: str = "/api/get", legit: bool = True, error: bool = False,
          endpoints: list[str] | None = None) -> list[Request]:
    """Emit requests from an explicit per-minute count profile (evenly spread within each minute)."""
    out: list[Request] = []
    for k, n in enumerate(minute_counts):
        if n <= 0:
            continue
        m0 = (start_minute + k) * 60.0
        for j in range(n):
            t = m0 + (j + 0.5) * 60.0 / n
            ep = endpoints[len(out) % len(endpoints)] if endpoints else endpoint
            out.append(Request(round(t, 3), client, ep, error, legit))
    return out


def _varied(client: str, base_per_min: int, minutes: int, start_minute: int = 0, *,
            amp: float = 0.35, legit: bool = True) -> list[Request]:
    """A varied baseline: per-minute counts oscillate ±amp so the rate has non-zero variance."""
    counts = []
    for k in range(minutes):
        factor = 1.0 + amp * (1 if k % 2 == 0 else -1) + (0.1 if k % 3 == 0 else -0.05)
        counts.append(max(0, int(round(base_per_min * factor))))
    return _emit(client, counts, start_minute, legit=legit)


def _flat(client: str, per_min: int, minutes: int, start_minute: int = 0, *,
          legit: bool = True, error: bool = False) -> list[Request]:
    return _emit(client, [per_min] * minutes, start_minute, legit=legit, error=error)


ONSET_MIN = int(ONSET // 60)
END_MIN = int(END // 60)


def scraper_burst() -> Scenario:
    """SCENARIO 1 — a scraper with a normal baseline suddenly hammers the API in bursts."""
    reqs: list[Request] = []
    for c in ("legit-a", "legit-b"):
        reqs += _varied(c, 120, END_MIN)                      # ~2/s legitimate background
    reqs += _varied("scraper", 120, ONSET_MIN, legit=False)   # scraper baseline ~2/s
    # bursts: one intense minute (~50/s) then two quiet minutes, repeating -> high burstiness
    pattern = ([3000, 60, 60] * 10)[:END_MIN - ONSET_MIN]
    reqs += _emit("scraper", pattern, ONSET_MIN, legit=False)
    reqs.sort(key=lambda r: r.t)
    return Scenario("scraper_burst",
                    "A scraper sends a normal baseline, then bursty high-volume traffic.",
                    reqs, abusive={"scraper"},
                    expected="TEMPORARY_BLOCK the scraper (bursty, heavily rejected)")


def legit_spike() -> Scenario:
    """SCENARIO 2 — a legitimate client's steady demand rises above the static limit."""
    reqs: list[Request] = []
    reqs += _varied("other", 120, END_MIN)
    reqs += _varied("customer", 360, ONSET_MIN)               # baseline ~6/s (below the 10/s limit)
    reqs += _flat("customer", 960, END_MIN - ONSET_MIN, ONSET_MIN)   # ~16/s sustained, non-bursty
    reqs.sort(key=lambda r: r.t)
    return Scenario("legit_spike",
                    "A legitimate client's steady traffic rises above the static limit.",
                    reqs, abusive=set(),
                    expected="ADJUST_LIMIT up (steady demand, limit too tight)")


def slow_and_low() -> Scenario:
    """SCENARIO 3 — low request rate but a wide endpoint spread (enumeration)."""
    reqs: list[Request] = []
    reqs += _varied("normal", 120, END_MIN)
    endpoints = [f"/api/resource/{i}" for i in range(60)]
    # ~4 req/min across many distinct endpoints -> >=30 unique over a 10-minute window
    reqs += _emit("scanner", [4] * (END_MIN - ONSET_MIN), ONSET_MIN, legit=False, endpoints=endpoints)
    reqs.sort(key=lambda r: r.t)
    return Scenario("slow_and_low",
                    "A client probes many endpoints at a deliberately low rate to dodge limits.",
                    reqs, abusive={"scanner"},
                    expected="TEMPORARY_BLOCK the scanner (slow-and-low enumeration)")


def noisy_tenant() -> Scenario:
    """SCENARIO 4 — a HIGH_VALUE tenant turns noisy and bursty; a block needs human approval."""
    reqs: list[Request] = []
    reqs += _varied("small-tenant", 120, END_MIN)
    reqs += _varied("vip-tenant", 180, ONSET_MIN)             # ~3/s baseline
    pattern = ([2700, 60, 60] * 10)[:END_MIN - ONSET_MIN]     # bursty high volume from onset
    reqs += _emit("vip-tenant", pattern, ONSET_MIN)
    reqs.sort(key=lambda r: r.t)
    return Scenario("noisy_tenant",
                    "A high-value tenant becomes noisy and bursty; auto-blocking is withheld for approval.",
                    reqs, abusive=set(), high_value={"vip-tenant"},
                    expected="propose TEMPORARY_BLOCK but hold PENDING_APPROVAL (high-value)")


def error_spike() -> Scenario:
    """SCENARIO 5 — the downstream starts failing (5xx) for one client."""
    reqs: list[Request] = []
    reqs += _varied("healthy", 120, END_MIN)
    reqs += _flat("app-client", 300, ONSET_MIN)                       # ~5/s healthy baseline
    # after onset: ~5/s but 60% of requests are served as 5xx
    good = _flat("app-client", 120, END_MIN - ONSET_MIN, ONSET_MIN)
    bad = _flat("app-client", 180, END_MIN - ONSET_MIN, ONSET_MIN, error=True)
    reqs += good + bad
    reqs.sort(key=lambda r: r.t)
    return Scenario("error_spike",
                    "The downstream service starts returning 5xx for a client's requests.",
                    reqs, abusive=set(),
                    expected="ALERT only (server-side problem, do not throttle the client)")


ALL = [scraper_burst, legit_spike, slow_and_low, noisy_tenant, error_spike]


def all_scenarios() -> list[Scenario]:
    return [factory() for factory in ALL]
