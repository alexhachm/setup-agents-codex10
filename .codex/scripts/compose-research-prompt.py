#!/usr/bin/env python3
"""
compose-research-prompt.py — Generates optimal ChatGPT prompts from research queue entries.

Usage:
    python3 compose-research-prompt.py <json_file_or_stdin>
    echo '{"topic":"x","question":"y"}' | python3 compose-research-prompt.py -

Outputs JSON with {prompt, mode, routing_reasoning} to stdout.
"""

import json
import re
import sys


# --- Routing heuristics ---
#
# Three tiers, escalating:
#   standard      — GPT-5.4 Pro. Focused knowledge acquisition: targeted questions
#                   to fill identified gaps in the knowledge base. Not trivia —
#                   these are specific technical questions the system couldn't
#                   answer from existing knowledge.
#   thinking      — GPT-5.4 Pro + Extended Thinking. Questions requiring analysis,
#                   trade-off evaluation, or architectural reasoning.
#   deep_research — Deep Research mode. Broad multi-source investigation, surveys,
#                   landscape analysis.

DEEP_RESEARCH_SIGNALS = [
    "comprehensive", "survey", "state of the art", "compare all",
    "research report", "investigate thoroughly", "deep dive",
    "all approaches", "exhaustive", "landscape of",
    "broad overview", "current ecosystem",
]

THINKING_SIGNALS = [
    "design", "architect", "trade-off", "trade off", "tradeoff",
    "should we", "pros and cons", "best approach", "optimal strategy",
    "multi-step", "why does", "how should", "what's the right way",
    "what is the right way", "recommend", "evaluate whether",
    "implications of", "when to use", "drawbacks of",
    "failure modes", "edge cases", "risk",
]

# Signals that the question references the project's own codebase
CODEBASE_SIGNALS = [
    "our code", "our repo", "the codebase", "our codebase",
    "our implementation", "our system", "our project",
    "how we ", "what we use", "how do we", "how does our",
    "in our ", "our current", "our existing",
    "the project", "this project", "the repo",
    "coordinator", "allocator", "watchdog", "merger",
    "cli-server", "research-queue", "chatgpt-driver",
    "worker-sentinel", "loop-sentinel",
]


def _references_codebase(item: dict) -> bool:
    """Detect whether a research item references the project codebase."""
    # Explicit: relevant_files or context provided → codebase-aware
    if item.get("relevant_files"):
        return True
    context = item.get("context")
    if isinstance(context, str) and context.strip():
        return True

    # Heuristic: check question and topic for codebase signals
    text = f"{item.get('question', '')} {item.get('topic', '')}".lower()
    for signal in CODEBASE_SIGNALS:
        if signal in text:
            return True

    # File path patterns in the question (e.g., "coordinator/src/", "setup.sh")
    if re.search(r'(?:coordinator|scripts|templates|\.codex|\.claude)[/\\]', text):
        return True

    return False


def _parse_json_field(value):
    """Parse a JSON string field into a list, or return as-is if already a list."""
    if not value:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else [parsed]
        except json.JSONDecodeError:
            return [value]
    return []


def _build_codebase_context(item: dict) -> str:
    """Build a codebase context block for the prompt.

    Always includes the project description and GitHub repo URL so ChatGPT
    understands what codebase we're researching for. Also includes relevant
    file paths so it can browse the actual source code on GitHub.
    """
    parts = []
    repo = item.get("github_repo", "")
    files = _parse_json_field(item.get("relevant_files"))
    context = item.get("context")
    context_str = context.strip() if isinstance(context, str) else ""

    parts.append("Project context:")
    parts.append("  This research is for a multi-agent autonomous coding system (codex10/setup-agents).")
    parts.append("  Stack: Node.js coordinator, Electron-based CLI, git worktree isolation,")
    parts.append("  SQLite state, shell sentinel loops. Agents: 3 masters (interface, architect,")
    parts.append("  allocator) + N workers in isolated worktrees.")

    if repo:
        parts.append(f"  Project repo: https://github.com/{repo}")
        parts.append(f"  Browse source: https://github.com/{repo}/tree/main")

    if context_str:
        parts.append(f"  {context_str}")

    if files:
        parts.append("  Relevant files:")
        for f in files:
            if repo:
                parts.append(f"    - {f}  (https://github.com/{repo}/blob/main/{f})")
            else:
                parts.append(f"    - {f}")

    parts.append("")
    return "\n".join(parts)


def route_question(question: str, explicit_mode: str = None) -> dict:
    """Classify a question into a routing tier.

    Returns {mode, reasoning}.
    """
    # Explicit escalation overrides heuristics (thinking/deep_research)
    # standard is the default — still run heuristics to see if escalation is warranted
    if explicit_mode and explicit_mode in ("thinking", "deep_research"):
        return {"mode": explicit_mode, "reasoning": f"Explicit override: {explicit_mode}"}

    q_lower = question.lower()

    # Deep research signals
    for signal in DEEP_RESEARCH_SIGNALS:
        if signal in q_lower:
            return {"mode": "deep_research", "reasoning": f"Matched deep_research signal: '{signal}'"}

    # Long multi-part questions → deep research
    if len(question) > 500 and q_lower.count("?") >= 2:
        return {"mode": "deep_research", "reasoning": "Long question (>500 chars) with multiple sub-questions"}

    # Thinking signals
    for signal in THINKING_SIGNALS:
        if signal in q_lower:
            return {"mode": "thinking", "reasoning": f"Matched thinking signal: '{signal}'"}

    # Decision-making context heuristic
    if re.search(r'\bor\b.*\bor\b', q_lower) or re.search(r'\bvs\.?\b', q_lower):
        return {"mode": "thinking", "reasoning": "Question contains comparison/decision context"}

    # Default: standard — focused knowledge acquisition to fill identified gaps
    return {"mode": "standard", "reasoning": "Focused knowledge query — no escalation signals"}


# --- Prompt composers ---

def compose_standard(item: dict) -> str:
    """Compose a prompt for focused knowledge acquisition.

    These are targeted questions driven by identified gaps in the knowledge base —
    not trivia, but specific technical questions the system couldn't answer from
    existing knowledge.
    """
    parts = []
    parts.append(f"I'm building a Node.js/Electron multi-agent coding system and need to fill a knowledge gap about {item['topic']}.")
    parts.append("")

    # Always include project context so ChatGPT knows what we're building
    codebase_block = _build_codebase_context(item)
    if codebase_block:
        parts.append(codebase_block)

    existing_raw = item.get("existing_knowledge")
    existing = existing_raw.strip() if isinstance(existing_raw, str) else ""
    if existing:
        parts.append("What I already know (from our existing knowledge base):")
        parts.append(existing)
        parts.append("")
        parts.append("I need to go beyond what I already know. Please don't repeat the above — focus on what's missing.")
        parts.append("")

    parts.append("Question:")
    parts.append(item["question"])
    parts.append("")

    links = _parse_json_field(item.get("target_links"))
    if links:
        parts.append("Please focus on these sources: " + ", ".join(links))
        parts.append("")

    parts.append("Please provide:")
    parts.append("1. Concrete, actionable answer with specifics (versions, APIs, config)")
    parts.append("2. Implementation patterns or code examples where relevant")
    parts.append("3. Known pitfalls or gotchas")
    parts.append("4. Links to authoritative documentation or source code")

    return "\n".join(parts)


def compose_thinking(item: dict) -> str:
    """Compose a prompt that encourages extended thinking / step-by-step reasoning."""
    parts = []
    parts.append(f"I need you to think carefully and deeply about the following for a Node.js/Electron multi-agent coding system.")
    parts.append("")

    # Always include project context so ChatGPT knows what we're building
    codebase_block = _build_codebase_context(item)
    if codebase_block:
        parts.append(codebase_block)

    existing_raw = item.get("existing_knowledge")
    existing = existing_raw.strip() if isinstance(existing_raw, str) else ""
    if existing:
        parts.append("Current understanding:")
        parts.append(existing)
        parts.append("")

    parts.append("Question requiring analysis:")
    parts.append(item["question"])
    parts.append("")

    links = _parse_json_field(item.get("target_links"))
    if links:
        parts.append("Relevant sources: " + ", ".join(links))
        parts.append("")

    parts.append("Please think through this step by step:")
    parts.append("1. Break down the problem and identify key considerations")
    parts.append("2. Analyze trade-offs between different approaches")
    parts.append("3. Provide a reasoned recommendation with justification")
    parts.append("4. Identify risks, edge cases, and potential pitfalls")
    parts.append("5. Give concrete implementation guidance if applicable")

    return "\n".join(parts)


def compose_deep_research(item: dict) -> str:
    """Compose a prompt for ChatGPT Deep Research mode."""
    parts = []
    parts.append(f"Research {item['topic']} comprehensively for a Node.js/Electron multi-agent coding system.")
    parts.append("")

    # Always include project context so ChatGPT knows what we're building
    codebase_block = _build_codebase_context(item)
    if codebase_block:
        parts.append(codebase_block)

    existing_raw = item.get("existing_knowledge")
    existing = existing_raw.strip() if isinstance(existing_raw, str) else ""
    if existing:
        parts.append("Current understanding:")
        parts.append(existing)
        parts.append("")

    parts.append("Research objectives:")
    parts.append(item["question"])
    parts.append("")

    links = _parse_json_field(item.get("target_links"))
    if links:
        parts.append("Priority sources to investigate: " + ", ".join(links))
        parts.append("")

    parts.append("Provide a structured research report covering:")
    parts.append("1. State of the art / current best practices")
    parts.append("2. Implementation approaches with trade-offs")
    parts.append("3. Specific code patterns or libraries (with versions)")
    parts.append("4. Known pitfalls and failure modes")
    parts.append("5. What's transferable to our architecture vs project-specific")

    return "\n".join(parts)


COMPOSERS = {
    "standard": compose_standard,
    "thinking": compose_thinking,
    "deep_research": compose_deep_research,
    # Legacy compat
    "regular": compose_standard,
}


def compose_prompt(item: dict) -> dict:
    """Route to the appropriate composer based on mode.

    Returns {prompt, mode, routing_reasoning}.
    """
    raw_mode = item.get("mode", "standard")

    # Route: explicit mode is respected, otherwise heuristics classify the question
    routing = route_question(item.get("question", ""), raw_mode)
    resolved_mode = routing["mode"]

    composer = COMPOSERS.get(resolved_mode, compose_standard)
    prompt = composer(item)

    return {
        "prompt": prompt,
        "mode": resolved_mode,
        "routing_reasoning": routing["reasoning"],
    }


def main():
    if len(sys.argv) > 1 and sys.argv[1] != "-":
        with open(sys.argv[1], "r") as f:
            data = json.load(f)
    else:
        data = json.load(sys.stdin)

    result = compose_prompt(data)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
