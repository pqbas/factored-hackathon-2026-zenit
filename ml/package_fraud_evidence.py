"""Package aggregate experiment evidence for the existing agent container."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "ml" / "reports" / "2026-10-04"
DESTINATION = ROOT / "agent" / "configs" / "fraud-evidence"
FILES = ("training_v5_catboost_data.json", "training_v6_advanced_data.json")


def packaged_report(source: Path) -> str:
    raw = source.read_bytes()
    report = json.loads(raw)
    selected = report["selected_candidate"]
    operating = next(
        entry["metrics"]
        for entry in report["exploratory_validation"]["frozen_budget_results"]
        if entry.get("budget", entry.get("budget_selected_on_operating_period")) == 0.01
    )
    result = {
        "evidence_source": {
            "path": source.relative_to(ROOT).as_posix(),
            "sha256": hashlib.sha256(raw).hexdigest(),
        },
        "selected_candidate": {key: selected[key] for key in ("candidate", "run_id")},
        "promotion_status": report["promotion_status"],
        "model_binary_logged": report["model_binary_logged"],
        "exploratory_validation": {
            "frozen_budget_results": [{
                "budget": 0.01,
                "metrics": {key: operating[key] for key in ("precision", "recall", "alerts")},
            }],
        },
    }
    return json.dumps(result, indent=2, allow_nan=False) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify packaged evidence without writing files")
    args = parser.parse_args()
    if not args.check:
        DESTINATION.mkdir(parents=True, exist_ok=True)
    for filename in FILES:
        expected = packaged_report(SOURCE / filename)
        target = DESTINATION / filename
        if args.check:
            if not target.is_file() or target.read_text() != expected:
                print(f"Packaged evidence needs regeneration: {filename}")
                return 1
        else:
            target.write_text(expected)
        print(f"{'Verified' if args.check else 'Packaged'} aggregate evidence: {filename}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
