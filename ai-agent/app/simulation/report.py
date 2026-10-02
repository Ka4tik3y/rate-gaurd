"""Render the static-vs-adaptive evaluation as measurable JSON + Markdown (spec §32–33)."""
from __future__ import annotations

import json
from dataclasses import asdict
from datetime import datetime, timezone

from app.simulation.harness import ArmMetrics, ScenarioResult


def _pct(x: float) -> str:
    return f"{x * 100:.1f}%"


def _opt(x) -> str:
    return "—" if x is None else f"{x:.0f}s"


def to_dict(results: list[ScenarioResult]) -> dict:
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "note": ("Offline, deterministic replay. The adaptive arm drives the real HeuristicPlanner "
                 "through a faithful mirror of the detector, Policy Gate, and closed loop. "
                 "Results are measured, not hard-coded."),
        "scenarios": [
            {"name": r.name, "description": r.description, "expected": r.expected,
             "static": asdict(r.static), "adaptive": asdict(r.adaptive),
             "adaptiveActions": r.applied_summary}
            for r in results
        ],
    }


def _row(label: str, s: ArmMetrics, a: ArmMetrics, attr, fmt=lambda v: f"{v}") -> str:
    sv, av = getattr(s, attr), getattr(a, attr)
    return f"| {label} | {fmt(sv)} | {fmt(av)} |"


def to_markdown(results: list[ScenarioResult]) -> str:
    out: list[str] = []
    out.append("# Evaluation — static vs AI-assisted adaptive rate limiting\n")
    out.append("_Offline, deterministic replay. The adaptive arm runs the real agent planner through a "
               "faithful mirror of the Phase 2 detector, the Phase 3 Policy Gate, and the Phase 4 "
               "closed loop. Every number below is measured from the run, not asserted._\n")
    # headline table
    out.append("## Summary\n")
    out.append("| Scenario | Legit blocked (static → adaptive) | Abuse blocked (static → adaptive) | "
               "5xx served (static → adaptive) | Agent actions |")
    out.append("|---|---|---|---|---|")
    for r in results:
        s, a = r.static, r.adaptive
        out.append(f"| {r.name} | {_pct(s.legit_blocked_rate)} → {_pct(a.legit_blocked_rate)} "
                   f"| {_pct(s.abuse_block_rate)} → {_pct(a.abuse_block_rate)} "
                   f"| {s.served_5xx} → {a.served_5xx} "
                   f"| {a.applied_actions} applied / {a.pending_approvals} pending / {a.alerts} alert / {a.rollbacks} rollback |")
    out.append("")
    # per-scenario detail
    for r in results:
        s, a = r.static, r.adaptive
        out.append(f"## {r.name}\n")
        out.append(f"{r.description}  \n_Intended adaptive response: {r.expected}._\n")
        out.append("| Metric | Static | Adaptive |")
        out.append("|---|---|---|")
        out.append(_row("Total requests", s, a, "total_requests"))
        out.append(_row("429 rate", s, a, "reject_rate", _pct))
        out.append(_row("Legitimate requests blocked", s, a, "legit_blocked"))
        out.append(_row("Legitimate block rate", s, a, "legit_blocked_rate", _pct))
        out.append(_row("Abuse requests served", s, a, "abuse_served"))
        out.append(_row("Abuse block rate", s, a, "abuse_block_rate", _pct))
        out.append(_row("5xx served", s, a, "served_5xx"))
        out.append(_row("Agent actions applied", s, a, "applied_actions"))
        out.append(_row("Gate rejections", s, a, "rejected_by_gate"))
        out.append(_row("Pending approvals", s, a, "pending_approvals"))
        out.append(_row("Alerts", s, a, "alerts"))
        out.append(_row("Rollbacks", s, a, "rollbacks"))
        out.append(f"| Time to mitigation | — | {_opt(a.time_to_mitigation_s)} |")
        out.append(f"| Recovery time | — | {_opt(a.recovery_time_s)} |")
        out.append("")
        if r.applied_summary:
            out.append("Adaptive decisions:\n")
            for line in r.applied_summary:
                out.append(f"- {line}")
            out.append("")
    return "\n".join(out)


def write_reports(results: list[ScenarioResult], json_path: str, md_path: str) -> None:
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(to_dict(results), f, indent=2)
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(to_markdown(results))
