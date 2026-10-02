# Evaluation — static vs AI-assisted adaptive rate limiting

_Offline, deterministic replay. The adaptive arm runs the real agent planner through a faithful mirror of the Phase 2 detector, the Phase 3 Policy Gate, and the Phase 4 closed loop. Every number below is measured from the run, not asserted._

## Summary

| Scenario | Legit blocked (static → adaptive) | Abuse blocked (static → adaptive) | 5xx served (static → adaptive) | Agent actions |
|---|---|---|---|---|
| scraper_burst | 0.0% → 0.0% | 69.3% → 79.1% | 0 → 0 | 3 applied / 0 pending / 0 alert / 0 rollback |
| legit_spike | 26.3% → 2.1% | 0.0% → 0.0% | 0 → 0 | 3 applied / 0 pending / 0 alert / 1 rollback |
| slow_and_low | 0.0% → 0.0% | 0.0% → 83.3% | 0 → 0 | 4 applied / 0 pending / 0 alert / 0 rollback |
| noisy_tenant | 54.3% → 49.2% | 0.0% → 0.0% | 0 → 0 | 1 applied / 3 pending / 0 alert / 0 rollback |
| error_spike | 0.0% → 0.0% | 0.0% → 0.0% | 3240 → 3240 | 17 applied / 0 pending / 17 alert / 0 rollback |

## scraper_burst

A scraper sends a normal baseline, then bursty high-volume traffic.  
_Intended adaptive response: TEMPORARY_BLOCK the scraper (bursty, heavily rejected)._

| Metric | Static | Adaptive |
|---|---|---|
| Total requests | 26676 | 26676 |
| 429 rate | 51.8% | 59.1% |
| Legitimate requests blocked | 0 | 0 |
| Legitimate block rate | 0.0% | 0.0% |
| Abuse requests served | 6126 | 4169 |
| Abuse block rate | 69.3% | 79.1% |
| 5xx served | 0 | 0 |
| Agent actions applied | 0 | 3 |
| Gate rejections | 0 | 7 |
| Pending approvals | 0 | 0 |
| Alerts | 0 | 0 |
| Rollbacks | 0 | 0 |
| Time to mitigation | — | 60s |
| Recovery time | — | — |

Adaptive decisions:

- t=660s scraper: TEMPORARY_BLOCK -> APPROVED (300s)
- t=960s scraper: TEMPORARY_BLOCK -> APPROVED (300s)
- t=1260s scraper: ADJUST_LIMIT -> APPROVED (cap 100->140)
- t=1320s scraper: TEMPORARY_BLOCK -> REJECTED (300s)
- t=1380s scraper: ADJUST_LIMIT -> REJECTED (cap 140->196)
- t=1440s scraper: TEMPORARY_BLOCK -> REJECTED (300s)
- t=1500s scraper: TEMPORARY_BLOCK -> REJECTED (300s)
- t=1560s scraper: ADJUST_LIMIT -> REJECTED (cap 140->196)
- t=1620s scraper: TEMPORARY_BLOCK -> REJECTED (300s)
- t=1680s scraper: TEMPORARY_BLOCK -> REJECTED (300s)

## legit_spike

A legitimate client's steady traffic rises above the static limit.  
_Intended adaptive response: ADJUST_LIMIT up (steady demand, limit too tight)._

| Metric | Static | Adaptive |
|---|---|---|
| Total requests | 24288 | 24288 |
| 429 rate | 26.3% | 2.1% |
| Legitimate requests blocked | 6381 | 501 |
| Legitimate block rate | 26.3% | 2.1% |
| Abuse requests served | 0 | 0 |
| Abuse block rate | 0.0% | 0.0% |
| 5xx served | 0 | 0 |
| Agent actions applied | 0 | 3 |
| Gate rejections | 0 | 0 |
| Pending approvals | 0 | 0 |
| Alerts | 0 | 0 |
| Rollbacks | 0 | 1 |
| Time to mitigation | — | — |
| Recovery time | — | 60s |

Adaptive decisions:

- t=660s customer: ADJUST_LIMIT -> APPROVED (cap 100->140)
- t=720s customer: ADJUST_LIMIT -> APPROVED (cap None->100) [rollback]
- t=720s customer: ADJUST_LIMIT -> APPROVED (cap 100->140)
- t=780s customer: ADJUST_LIMIT -> APPROVED (cap 140->196)

## slow_and_low

A client probes many endpoints at a deliberately low rate to dodge limits.  
_Intended adaptive response: TEMPORARY_BLOCK the scanner (slow-and-low enumeration)._

| Metric | Static | Adaptive |
|---|---|---|
| Total requests | 3444 | 3444 |
| 429 rate | 0.0% | 1.7% |
| Legitimate requests blocked | 0 | 0 |
| Legitimate block rate | 0.0% | 0.0% |
| Abuse requests served | 72 | 12 |
| Abuse block rate | 0.0% | 83.3% |
| 5xx served | 0 | 0 |
| Agent actions applied | 0 | 4 |
| Gate rejections | 0 | 1 |
| Pending approvals | 0 | 0 |
| Alerts | 0 | 0 |
| Rollbacks | 0 | 0 |
| Time to mitigation | — | 60s |
| Recovery time | — | — |

Adaptive decisions:

- t=660s scanner: TEMPORARY_BLOCK -> APPROVED (300s)
- t=960s scanner: ADJUST_LIMIT -> APPROVED (cap 100->140)
- t=1020s scanner: TEMPORARY_BLOCK -> REJECTED (600s)
- t=1080s scanner: TEMPORARY_BLOCK -> APPROVED (600s)
- t=1680s scanner: TEMPORARY_BLOCK -> APPROVED (600s)

## noisy_tenant

A high-value tenant becomes noisy and bursty; auto-blocking is withheld for approval.  
_Intended adaptive response: propose TEMPORARY_BLOCK but hold PENDING_APPROVAL (high-value)._

| Metric | Static | Adaptive |
|---|---|---|
| Total requests | 22110 | 22110 |
| 429 rate | 54.3% | 49.2% |
| Legitimate requests blocked | 12006 | 10886 |
| Legitimate block rate | 54.3% | 49.2% |
| Abuse requests served | 0 | 0 |
| Abuse block rate | 0.0% | 0.0% |
| 5xx served | 0 | 0 |
| Agent actions applied | 0 | 1 |
| Gate rejections | 0 | 14 |
| Pending approvals | 0 | 3 |
| Alerts | 0 | 0 |
| Rollbacks | 0 | 0 |
| Time to mitigation | — | — |
| Recovery time | — | 240s |

Adaptive decisions:

- t=660s vip-tenant: TEMPORARY_BLOCK -> PENDING_APPROVAL (300s)
- t=720s vip-tenant: TEMPORARY_BLOCK -> PENDING_APPROVAL (300s)
- t=780s vip-tenant: TEMPORARY_BLOCK -> PENDING_APPROVAL (300s)
- t=840s vip-tenant: ADJUST_LIMIT -> APPROVED (cap 100->140)
- t=900s vip-tenant: ADJUST_LIMIT -> REJECTED (cap 140->196)
- t=960s vip-tenant: TEMPORARY_BLOCK -> REJECTED (300s)
- t=1020s vip-tenant: ADJUST_LIMIT -> REJECTED (cap 140->196)
- t=1080s vip-tenant: ADJUST_LIMIT -> REJECTED (cap 140->196)
- t=1140s vip-tenant: TEMPORARY_BLOCK -> REJECTED (300s)
- t=1200s vip-tenant: ADJUST_LIMIT -> REJECTED (cap 140->196)
- t=1260s vip-tenant: TEMPORARY_BLOCK -> REJECTED (300s)
- t=1320s vip-tenant: TEMPORARY_BLOCK -> REJECTED (300s)
- t=1380s vip-tenant: ADJUST_LIMIT -> REJECTED (cap 140->196)
- t=1440s vip-tenant: ADJUST_LIMIT -> REJECTED (cap 140->196)
- t=1500s vip-tenant: TEMPORARY_BLOCK -> REJECTED (300s)
- t=1560s vip-tenant: ADJUST_LIMIT -> REJECTED (cap 140->196)
- t=1620s vip-tenant: ADJUST_LIMIT -> REJECTED (cap 140->196)
- t=1680s vip-tenant: TEMPORARY_BLOCK -> REJECTED (300s)

## error_spike

The downstream service starts returning 5xx for a client's requests.  
_Intended adaptive response: ALERT only (server-side problem, do not throttle the client)._

| Metric | Static | Adaptive |
|---|---|---|
| Total requests | 11772 | 11772 |
| 429 rate | 0.0% | 0.0% |
| Legitimate requests blocked | 0 | 0 |
| Legitimate block rate | 0.0% | 0.0% |
| Abuse requests served | 0 | 0 |
| Abuse block rate | 0.0% | 0.0% |
| 5xx served | 3240 | 3240 |
| Agent actions applied | 0 | 17 |
| Gate rejections | 0 | 0 |
| Pending approvals | 0 | 0 |
| Alerts | 0 | 17 |
| Rollbacks | 0 | 0 |
| Time to mitigation | — | — |
| Recovery time | — | — |

Adaptive decisions:

- t=720s app-client: ALERT -> APPROVED
- t=780s app-client: ALERT -> APPROVED
- t=840s app-client: ALERT -> APPROVED
- t=900s app-client: ALERT -> APPROVED
- t=960s app-client: ALERT -> APPROVED
- t=1020s app-client: ALERT -> APPROVED
- t=1080s app-client: ALERT -> APPROVED
- t=1140s app-client: ALERT -> APPROVED
- t=1200s app-client: ALERT -> APPROVED
- t=1260s app-client: ALERT -> APPROVED
- t=1320s app-client: ALERT -> APPROVED
- t=1380s app-client: ALERT -> APPROVED
- t=1440s app-client: ALERT -> APPROVED
- t=1500s app-client: ALERT -> APPROVED
- t=1560s app-client: ALERT -> APPROVED
- t=1620s app-client: ALERT -> APPROVED
- t=1680s app-client: ALERT -> APPROVED
