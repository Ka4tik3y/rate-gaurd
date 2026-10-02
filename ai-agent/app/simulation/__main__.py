"""CLI: run the full evaluation harness and write JSON + Markdown reports.

    python -m app.simulation [--out-dir ../evaluation/results]

Offline and deterministic — no network, no Redis, no API key.
"""
from __future__ import annotations

import argparse
import asyncio
import os

from app.simulation.harness import run_all
from app.simulation.report import to_markdown, write_reports


def main() -> None:
    ap = argparse.ArgumentParser(description="Static vs adaptive rate-limiting evaluation")
    default_out = os.path.join(os.path.dirname(__file__), "..", "..", "..", "evaluation", "results")
    ap.add_argument("--out-dir", default=os.path.normpath(default_out),
                    help="directory for results.json / results.md")
    ap.add_argument("--quiet", action="store_true", help="do not print the Markdown report")
    args = ap.parse_args()

    results = asyncio.run(run_all())
    os.makedirs(args.out_dir, exist_ok=True)
    json_path = os.path.join(args.out_dir, "results.json")
    md_path = os.path.join(args.out_dir, "results.md")
    write_reports(results, json_path, md_path)
    if not args.quiet:
        print(to_markdown(results))
    print(f"\nWrote {json_path} and {md_path}")


if __name__ == "__main__":
    main()
