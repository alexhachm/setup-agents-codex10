#!/usr/bin/env python3
"""
ingest-research.py — Ingests ChatGPT research responses into the knowledge system.

Takes response text (stdin) and writes:
1. Atomic research note at research/topics/<topic>/YYYY-MM-DD__chatgpt-<mode>__R-<shortid>.md
2. Updates topic rollup at research/topics/<topic>/_rollup.md
3. Emits quality signal to signals/uses/YYYY-MM.md
4. Prints the created note path to stdout

Usage:
    echo "response text" | python3 ingest-research.py --topic <topic> --mode regular [--question "..."]
    python3 ingest-research.py --test
"""

import argparse
import hashlib
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent.resolve()
PROJECT_DIR = SCRIPT_DIR.parent.parent
KNOWLEDGE_DIR = PROJECT_DIR / ".codex" / "knowledge"
RESEARCH_DIR = KNOWLEDGE_DIR / "research" / "topics"
SIGNALS_DIR = KNOWLEDGE_DIR / "signals" / "uses"


def generate_short_id():
    """Generate a short unique ID for the research note."""
    raw = hashlib.sha256(f"{time.time()}{os.getpid()}".encode()).hexdigest()
    return raw[:6]


def sanitize_topic(topic: str) -> str:
    """Sanitize topic name for use as directory name."""
    return re.sub(r'[^a-zA-Z0-9_-]', '-', topic.strip().lower())


def format_note(topic: str, mode: str, question: str, response_text: str, short_id: str) -> str:
    """Format the response into a research note with frontmatter."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    source_tag = f"chatgpt-{mode}"

    # Try to extract sections from the response
    findings = response_text.strip()

    note = f"""---
kind: research_note
scope: project
id: R-{short_id}
title: "{topic} — ChatGPT {mode} research"
created: {today}
updated: {today}
topics:
  - {topic}
sources:
  - {source_tag}
confidence: medium
status: draft
---

# Question
{question}

# Findings
{findings}

# What Seems Transferable vs Project-Specific
Transferable:
- (Review and categorize the findings above)

Project-specific:
- (Review and categorize the findings above)

# Implications for Our Codebase
- (Review findings and identify actionable implications)

# Related Notes
- topics/{topic}/_rollup.md
"""
    return note


def create_rollup_if_missing(topic_dir: Path, topic: str):
    """Create a topic rollup file if it doesn't exist."""
    rollup_path = topic_dir / "_rollup.md"
    if rollup_path.exists():
        return

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    rollup = f"""---
kind: topic_rollup
scope: project
topic: {topic}
updated: {today}
top_notes: []
---

# {topic.replace('-', ' ').title()}

## Current Recommended Approach
(To be filled after reviewing research notes)

## Decision Hooks
- (To be added)

## Known Pitfalls
- (To be added)

## Evidence
- (Research notes will be listed here)

## What We Tried That Did NOT Work
- (To be added)
"""
    rollup_path.write_text(rollup, encoding="utf-8")


def update_rollup(topic_dir: Path, short_id: str, topic: str, mode: str):
    """Update the topic rollup with the new note reference."""
    rollup_path = topic_dir / "_rollup.md"
    if not rollup_path.exists():
        create_rollup_if_missing(topic_dir, topic)

    content = rollup_path.read_text(encoding="utf-8")
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Update the 'updated' date in frontmatter
    content = re.sub(
        r'^updated:.*$',
        f'updated: {today}',
        content,
        count=1,
        flags=re.MULTILINE,
    )

    # Add note to top_notes in frontmatter
    top_notes_match = re.search(r'^top_notes:.*$', content, re.MULTILINE)
    if top_notes_match:
        line = top_notes_match.group()
        if line.strip() == "top_notes: []":
            content = content.replace(line, f"top_notes:\n  - R-{short_id}")
        else:
            # Insert after the top_notes line
            content = content.replace(line, f"{line}\n  - R-{short_id}")

    # Add evidence entry
    evidence_marker = "## Evidence"
    if evidence_marker in content:
        source_tag = f"chatgpt-{mode}"
        evidence_entry = f"\n- R-{short_id} ({source_tag}): auto-enriched research"
        content = content.replace(
            evidence_marker,
            f"{evidence_marker}{evidence_entry}",
            1,
        )

    rollup_path.write_text(content, encoding="utf-8")


def emit_signal(topic: str, mode: str, rollup_path: str):
    """Emit quality signal to signals/uses/YYYY-MM.md."""
    SIGNALS_DIR.mkdir(parents=True, exist_ok=True)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    month_file = SIGNALS_DIR / f"{datetime.now(timezone.utc).strftime('%Y-%m')}.md"

    lines = []
    lines.append(f"{today} chatgpt-research used: {rollup_path}")
    lines.append(f'{today} chatgpt-research vote: {rollup_path} +1 "auto-enriched via ChatGPT {mode}"')

    with open(month_file, "a", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def ingest(topic: str, mode: str, question: str, response_text: str) -> str:
    """Main ingestion: create note, update rollup, emit signal. Returns note path."""
    safe_topic = sanitize_topic(topic)
    short_id = generate_short_id()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    source_tag = f"chatgpt-{mode}"

    # Ensure topic directory exists
    topic_dir = RESEARCH_DIR / safe_topic
    topic_dir.mkdir(parents=True, exist_ok=True)

    # 1. Create atomic note
    note_filename = f"{today}__{source_tag}__R-{short_id}.md"
    note_path = topic_dir / note_filename
    note_content = format_note(topic, mode, question, response_text, short_id)
    note_path.write_text(note_content, encoding="utf-8")

    # 2. Update/create rollup
    create_rollup_if_missing(topic_dir, topic)
    update_rollup(topic_dir, short_id, topic, mode)

    # 3. Emit quality signal
    relative_rollup = f"research/topics/{safe_topic}/_rollup.md"
    emit_signal(topic, mode, relative_rollup)

    # Return the relative note path
    relative_note = f"research/topics/{safe_topic}/{note_filename}"
    return relative_note


def run_test():
    """Run a test ingestion with sample data."""
    test_topic = "test-topic"
    test_mode = "regular"
    test_question = "What is the best way to handle async operations in Node.js?"
    test_response = """Here are the key approaches for async operations in Node.js:

1. **Promises** - The modern standard for async operations
2. **async/await** - Syntactic sugar over Promises
3. **Callbacks** - Legacy pattern, avoid for new code

Key patterns:
- Use Promise.all() for parallel operations
- Use for-await-of for async iterables
- Always handle rejections with try/catch

Pitfalls:
- Unhandled promise rejections crash Node.js 15+
- Mixing callbacks and promises leads to bugs
"""

    result_path = ingest(test_topic, test_mode, test_question, test_response)
    print(result_path)
    return 0


def main():
    parser = argparse.ArgumentParser(description="Ingest ChatGPT research into knowledge system")
    parser.add_argument("--topic", help="Research topic")
    parser.add_argument("--mode", default="regular", help="Research mode (regular|deep_research)")
    parser.add_argument("--question", default="", help="Original research question")
    parser.add_argument("--test", action="store_true", help="Run test ingestion")
    args = parser.parse_args()

    if args.test:
        sys.exit(run_test())

    if not args.topic:
        print("Error: --topic is required", file=sys.stderr)
        sys.exit(1)

    # Read response from stdin
    response_text = sys.stdin.read()
    if not response_text.strip():
        print("Error: no response text provided on stdin", file=sys.stderr)
        sys.exit(1)

    result_path = ingest(args.topic, args.mode, args.question, response_text)
    print(result_path)


if __name__ == "__main__":
    main()
