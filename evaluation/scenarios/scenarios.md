# Evaluation scenarios (§32)

All five are deterministic. Timeline: a 60s detector step over 5- and 10-minute windows; the
EWMA baseline warms up on full windows only (t ≥ 300s), the anomaly begins at **t = 600s**, and the
run ends at **t = 1680s** (28 simulated minutes). Static bucket: capacity 100, refill 10/s.
Definitions live in [`ai-agent/app/simulation/scenarios.py`](../../ai-agent/app/simulation/scenarios.py).

| # | Scenario | Traffic | Ground truth | Intended adaptive response |
|---|---|---|---|---|
| 1 | **scraper_burst** | A client with a ~2/s baseline then bursts ~50/s in concentrated minutes. | abusive | **TEMPORARY_BLOCK** — bursty, heavily rejected. |
| 2 | **legit_spike** | A legitimate client's steady demand rises ~6/s → ~16/s (non-bursty), above the limit. | legitimate | **ADJUST_LIMIT up** — limit too tight for real demand. |
| 3 | **slow_and_low** | ~4 req/min spread across 30–40 distinct endpoints (enumeration). | abusive | **TEMPORARY_BLOCK** — slow-and-low scanning that volume rules miss. |
| 4 | **noisy_tenant** | A **HIGH_VALUE** tenant turns noisy/bursty. | legitimate (high-value) | Propose **TEMPORARY_BLOCK** but hold **PENDING_APPROVAL** for a human. |
| 5 | **error_spike** | One client's downstream starts returning ~60 % 5xx. | legitimate | **ALERT only** — server-side problem; throttling the client would not help. |

Ground-truth `abusive` / `legitimate` labels are used only to score false blocks and abuse
detection — the agent never sees them; it decides from metrics alone, exactly as in production.

## How each path is exercised

- **request-rate spike** (scenarios 1, 2, 4) fires the EWMA/z-score detector (deviation = z-score,
  comfortably above the gate's evidence floor of 2.0). The planner then splits on burstiness:
  bursty ⇒ block (1, 4), steady ⇒ raise the limit (2).
- **slow_and_low** (3) fires the endpoint-spread rule on the 10-minute window (deviation =
  endpoints / 15 ≥ 2), which volume-based static limiting cannot see at all.
- **error_ratio** (5) fires the 5xx rule; the planner alerts and proposes no mutation.
- **high-value approval** (4) is enforced by the gate: a block of a `HIGH_VALUE` client is never
  auto-applied.
