#!/usr/bin/env python3
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path


VALID_STATUSES = {"pending", "running", "passed", "failed", "blocked"}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def die(message: str) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(1)


def require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        die(f"Missing required environment variable: {name}")
    return value


def load_paths() -> dict:
    run_id = require_env("MAC10_LIVE_RUN_ID")
    run_dir = Path(require_env("MAC10_LIVE_RUN_DIR"))
    checklist = Path(os.environ.get("MAC10_LIVE_CHECKLIST", str(run_dir / "checklist.json")))
    summary = run_dir / "summary.md"
    notes = run_dir / "notes.md"
    failures = run_dir / "failures"
    return {
        "run_id": run_id,
        "run_dir": run_dir,
        "checklist": checklist,
        "summary": summary,
        "notes": notes,
        "failures": failures,
    }


def load_data(checklist_path: Path) -> dict:
    if not checklist_path.exists():
        die(f"Checklist file not found: {checklist_path}")
    data = json.loads(checklist_path.read_text(encoding="utf-8"))
    scenarios = data.get("scenarios")
    if not isinstance(scenarios, list):
        die("Checklist JSON missing scenarios array")
    for scenario in scenarios:
        scenario.setdefault("status", "pending")
        scenario.setdefault("notes", [])
        scenario.setdefault("evidence", [])
    return data


def save_data(checklist_path: Path, data: dict) -> None:
    checklist_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def append_note(notes_path: Path, message: str) -> None:
    notes_path.parent.mkdir(parents=True, exist_ok=True)
    if not notes_path.exists():
        notes_path.write_text("# Live E2E Audit Notes\n\n", encoding="utf-8")
    with notes_path.open("a", encoding="utf-8") as handle:
        handle.write(f"- **{utc_now()}** — {message}\n")


def compute_counts(data: dict) -> dict:
    counts = {status: 0 for status in VALID_STATUSES}
    for scenario in data.get("scenarios", []):
        status = scenario.get("status", "pending")
        counts[status] = counts.get(status, 0) + 1
    counts["total"] = len(data.get("scenarios", []))
    return counts


def overall_status(data: dict) -> str:
    counts = compute_counts(data)
    if counts["running"] or counts["pending"]:
        return "IN PROGRESS"
    if counts["failed"] or counts["blocked"]:
        return "FAILED"
    return "PASSED"


def render_summary(paths: dict, data: dict) -> None:
    counts = compute_counts(data)
    running = [s["id"] for s in data.get("scenarios", []) if s.get("status") == "running"]
    failures = [s["id"] for s in data.get("scenarios", []) if s.get("status") in {"failed", "blocked"}][:3]
    lines = [
        "# Live E2E Audit Summary",
        "",
        f"**Run ID:** {paths['run_id']}",
        f"**Updated:** {utc_now()}",
        f"**Status:** {overall_status(data)}",
        "",
        "## Counts",
        "",
        f"- pending: {counts['pending']}",
        f"- running: {counts['running']}",
        f"- passed: {counts['passed']}",
        f"- failed: {counts['failed']}",
        f"- blocked: {counts['blocked']}",
    ]
    if running:
        lines.extend(["", "## Active Scenarios", ""])
        lines.extend([f"- {scenario_id}" for scenario_id in running])
    if failures:
        lines.extend(["", "## First Failures Worth Fixing", ""])
        lines.extend([f"- {scenario_id}" for scenario_id in failures])
    paths["summary"].write_text("\n".join(lines) + "\n", encoding="utf-8")


def ensure_initialized(paths: dict, data: dict) -> None:
    paths["run_dir"].mkdir(parents=True, exist_ok=True)
    paths["failures"].mkdir(parents=True, exist_ok=True)
    if not paths["notes"].exists():
        paths["notes"].write_text("# Live E2E Audit Notes\n\n", encoding="utf-8")
    save_data(paths["checklist"], data)
    render_summary(paths, data)


def get_scenario(data: dict, scenario_id: str) -> dict:
    for scenario in data.get("scenarios", []):
        if scenario.get("id") == scenario_id:
            return scenario
    die(f"Unknown scenario id: {scenario_id}")


def command_init(paths: dict, data: dict, args: list[str]) -> None:
    ensure_initialized(paths, data)
    append_note(paths["notes"], " ".join(args) if args else "Initialized live E2E artifacts.")


def command_note(paths: dict, data: dict, args: list[str]) -> None:
    if not args:
        die("note requires a message")
    append_note(paths["notes"], " ".join(args))
    render_summary(paths, data)


def command_scenario_start(paths: dict, data: dict, args: list[str]) -> None:
    if not args:
        die("scenario-start requires <scenario_id> [message]")
    scenario_id = args[0]
    message = " ".join(args[1:]).strip()
    scenario = get_scenario(data, scenario_id)
    scenario["status"] = "running"
    scenario["started_at"] = utc_now()
    scenario.pop("finished_at", None)
    if message:
        scenario["notes"].append(message)
        append_note(paths["notes"], f"{scenario_id}: {message}")
    else:
        append_note(paths["notes"], f"{scenario_id}: started")
    save_data(paths["checklist"], data)
    render_summary(paths, data)


def command_scenario_note(paths: dict, data: dict, args: list[str]) -> None:
    if len(args) < 2:
        die("scenario-note requires <scenario_id> <message>")
    scenario_id = args[0]
    message = " ".join(args[1:]).strip()
    scenario = get_scenario(data, scenario_id)
    scenario["notes"].append(message)
    append_note(paths["notes"], f"{scenario_id}: {message}")
    save_data(paths["checklist"], data)
    render_summary(paths, data)


def command_scenario_evidence(paths: dict, data: dict, args: list[str]) -> None:
    if len(args) < 2:
        die("scenario-evidence requires <scenario_id> <evidence>")
    scenario_id = args[0]
    evidence = " ".join(args[1:]).strip()
    scenario = get_scenario(data, scenario_id)
    scenario["evidence"].append(evidence)
    save_data(paths["checklist"], data)
    render_summary(paths, data)


def command_scenario_status(paths: dict, data: dict, args: list[str]) -> None:
    if len(args) < 2:
        die("scenario-status requires <scenario_id> <status> [message]")
    scenario_id, status = args[0], args[1]
    message = " ".join(args[2:]).strip()
    if status not in {"running", "passed", "failed", "blocked"}:
        die(f"Invalid scenario status: {status}")
    scenario = get_scenario(data, scenario_id)
    scenario["status"] = status
    now = utc_now()
    if status == "running":
        scenario["started_at"] = now
        scenario.pop("finished_at", None)
    else:
        scenario["finished_at"] = now
    if message:
        scenario["notes"].append(message)
        append_note(paths["notes"], f"{scenario_id}: {status} — {message}")
    else:
        append_note(paths["notes"], f"{scenario_id}: {status}")
    save_data(paths["checklist"], data)
    render_summary(paths, data)


def main() -> None:
    if len(sys.argv) < 2:
        die("Usage: live-e2e-artifacts.py <command> [args...]")
    paths = load_paths()
    data = load_data(paths["checklist"])
    command = sys.argv[1]
    args = sys.argv[2:]
    handlers = {
        "init": command_init,
        "note": command_note,
        "scenario-start": command_scenario_start,
        "scenario-note": command_scenario_note,
        "scenario-evidence": command_scenario_evidence,
        "scenario-status": command_scenario_status,
    }
    handler = handlers.get(command)
    if handler is None:
        die(f"Unknown command: {command}")
    handler(paths, data, args)


if __name__ == "__main__":
    main()
