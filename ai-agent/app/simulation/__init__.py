"""Phase 5 — offline simulation & evaluation harness.

A *separate* evaluation system (spec §29, §32–33) that replays deterministic traffic
scenarios through a faithful offline model of the production pipeline and compares a
**static** rate limit against the **AI-assisted adaptive** one driven by the real agent
planner. It never touches Redis or the live gateway — it mirrors their logic so results
are reproducible and measurable, and it uses the production thresholds and guardrails.

Modules:
* engine    — token bucket, per-window metric aggregation, the deterministic detector
              (EWMA/z-score + threshold rules) and the sim Policy Gate, all mirroring Java.
* scenarios — the five traffic scenarios (§32).
* harness   — runs a scenario under static and adaptive policies and measures outcomes.
* report    — renders the measurable comparison as JSON + Markdown.
"""
