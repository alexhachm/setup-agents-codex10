#!/usr/bin/env bash
# e2e-db-check.sh — DB diagnostic helper for live E2E verification.
# Usage: bash scripts/e2e-db-check.sh <check-name> [args...]
# Outputs JSON to stdout. Exit 0 = query ran, exit 1 = script error.
# Uses python3 sqlite3 module (no sqlite3 CLI required).
set -euo pipefail

PROJECT_DIR="${MAC10_LIVE_TEST_PROJECT_DIR:-${MAC10_LIVE_REAL_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}}"
NAMESPACE="${MAC10_NAMESPACE:-mac10}"

# Resolve DB path — coordinator stores it under .claude/state/
DB=""
for candidate in \
  "$PROJECT_DIR/.claude/state/${NAMESPACE}.db" \
  "$PROJECT_DIR/.claude/state/mac10.db"; do
  if [ -f "$candidate" ]; then
    DB="$candidate"
    break
  fi
done

if [ -z "$DB" ]; then
  echo '{"error":"coordinator database not found","project_dir":"'"$PROJECT_DIR"'","namespace":"'"$NAMESPACE"'"}' >&2
  exit 1
fi

# All queries run through python3 sqlite3 module
exec python3 - "$DB" "$@" <<'PYEOF'
import json, sqlite3, sys, os

db_path = sys.argv[1]
check = sys.argv[2] if len(sys.argv) > 2 else ""
args = sys.argv[3:]

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row

def rows(sql, params=()):
    return [dict(r) for r in conn.execute(sql, params).fetchall()]

def row(sql, params=()):
    r = conn.execute(sql, params).fetchone()
    return dict(r) if r else None

def out(data):
    json.dump(data, sys.stdout, indent=2, default=str)
    print()

def need(n, usage):
    if len(args) < n:
        print(json.dumps({"error": f"Usage: e2e-db-check.sh {usage}"}), file=sys.stderr)
        sys.exit(1)

# ---- checks ----

if check == "request-status":
    need(1, "request-status <request_id>")
    out(row("SELECT id, status, previous_status, tier, created_at, updated_at, completed_at, result FROM requests WHERE id = ?", (args[0],)))

elif check == "tasks-for-request":
    need(1, "tasks-for-request <request_id>")
    out(rows("SELECT id, status, subject, assigned_to, pr_url, branch, started_at, completed_at FROM tasks WHERE request_id = ?", (args[0],)))

elif check == "task-status":
    need(1, "task-status <task_id>")
    out(row("SELECT id, status, subject, assigned_to, pr_url, branch, started_at, completed_at, result FROM tasks WHERE id = ?", (int(args[0]),)))

elif check == "worker-state":
    need(1, "worker-state <worker_id>")
    out(row("SELECT id, status, current_task_id, last_heartbeat, pid, backend, tmux_session, tmux_window, launched_at, domain FROM workers WHERE id = ?", (int(args[0]),)))

elif check == "merge-queue-for-task":
    need(1, "merge-queue-for-task <task_id>")
    out(rows("SELECT id, status, pr_url, branch, merged_at, error, retry_count, failure_class FROM merge_queue WHERE task_id = ?", (int(args[0]),)))

elif check == "merge-queue-for-request":
    need(1, "merge-queue-for-request <request_id>")
    out(rows("SELECT id, task_id, status, pr_url, branch, merged_at, error FROM merge_queue WHERE request_id = ?", (args[0],)))

elif check == "loop-state":
    need(1, "loop-state <loop_id>")
    out(row("SELECT id, status, iteration_count, last_heartbeat, pid, created_at, updated_at, stopped_at FROM loops WHERE id = ?", (int(args[0]),)))

elif check == "loop-requests":
    need(1, "loop-requests <loop_id>")
    out(rows("SELECT id, status, description, tier, created_at, completed_at FROM requests WHERE loop_id = ?", (int(args[0]),)))

elif check == "research-intent-status":
    need(1, "research-intent-status <intent_id>")
    out(row("SELECT id, status, intent_type, priority_score, failure_count, last_error, created_at, updated_at, resolved_at FROM research_intents WHERE id = ?", (int(args[0]),)))

elif check == "research-pending-count":
    out(row("SELECT count(*) as count FROM research_intents WHERE status IN ('queued','planned','running')"))

elif check == "browser-job-status":
    need(1, "browser-job-status <job_id>")
    out(row("SELECT id, session_id, status, job_type, query, result_payload, error, attempt_count, started_at, completed_at FROM browser_research_jobs WHERE id = ?", (int(args[0]),)))

elif check == "recent-requests":
    limit = int(args[0]) if args else 10
    out(rows("SELECT id, description, status, tier, loop_id, created_at, updated_at, completed_at FROM requests ORDER BY created_at DESC, id DESC LIMIT ?", (limit,)))

elif check == "recent-loops":
    limit = int(args[0]) if args else 10
    out(rows("SELECT id, prompt, status, iteration_count, namespace, last_heartbeat, created_at, updated_at, stopped_at FROM loops ORDER BY id DESC LIMIT ?", (limit,)))

elif check == "recent-research-intents":
    limit = int(args[0]) if args else 10
    out(rows("SELECT id, request_id, task_id, intent_type, status, priority_score, failure_count, created_at, updated_at, resolved_at FROM research_intents ORDER BY id DESC LIMIT ?", (limit,)))

elif check == "mail-for-recipient":
    need(1, "mail-for-recipient <recipient> [limit] [type]")
    recipient = args[0]
    limit = int(args[1]) if len(args) > 1 else 10
    mail_type = args[2] if len(args) > 2 else ""
    if mail_type:
        out(rows("SELECT id, recipient, type, payload, consumed, created_at FROM mail WHERE recipient = ? AND type = ? ORDER BY id DESC LIMIT ?", (recipient, mail_type, limit)))
    else:
        out(rows("SELECT id, recipient, type, payload, consumed, created_at FROM mail WHERE recipient = ? ORDER BY id DESC LIMIT ?", (recipient, limit)))

elif check == "request-by-description":
    need(1, "request-by-description <substring> [limit]")
    needle = args[0]
    limit = int(args[1]) if len(args) > 1 else 10
    out(rows("SELECT id, description, status, tier, loop_id, created_at, updated_at, completed_at FROM requests WHERE description LIKE ? ORDER BY created_at DESC, id DESC LIMIT ?", (f"%{needle}%", limit)))

elif check == "loop-by-prompt":
    need(1, "loop-by-prompt <substring> [limit]")
    needle = args[0]
    limit = int(args[1]) if len(args) > 1 else 10
    out(rows("SELECT id, prompt, status, iteration_count, namespace, last_heartbeat, created_at, updated_at, stopped_at FROM loops WHERE prompt LIKE ? ORDER BY id DESC LIMIT ?", (f"%{needle}%", limit)))

elif check == "research-intent-by-payload":
    need(1, "research-intent-by-payload <substring> [limit]")
    needle = args[0]
    limit = int(args[1]) if len(args) > 1 else 10
    out(rows("SELECT id, request_id, task_id, intent_type, intent_payload, status, priority_score, failure_count, created_at, updated_at, resolved_at FROM research_intents WHERE intent_payload LIKE ? ORDER BY id DESC LIMIT ?", (f"%{needle}%", limit)))

elif check == "master1-debug-snapshot":
    limit = int(args[0]) if args else 10
    snapshot = {
        "requests": rows("SELECT id, description, status, tier, loop_id, created_at, updated_at, completed_at FROM requests ORDER BY created_at DESC, id DESC LIMIT ?", (limit,)),
        "loops": rows("SELECT id, prompt, status, iteration_count, namespace, last_heartbeat, created_at, updated_at, stopped_at FROM loops ORDER BY id DESC LIMIT ?", (limit,)),
        "research_intents": rows("SELECT id, request_id, task_id, intent_type, status, priority_score, failure_count, created_at, updated_at, resolved_at FROM research_intents ORDER BY id DESC LIMIT ?", (limit,)),
        "mail": rows("SELECT id, recipient, type, payload, consumed, created_at FROM mail WHERE recipient = 'master-1' ORDER BY id DESC LIMIT ?", (limit,)),
        "activity": rows("SELECT id, actor, action, details, created_at FROM activity_log WHERE actor = 'master-1' ORDER BY id DESC LIMIT ?", (limit,)),
    }
    out(snapshot)

elif check == "recent-activity":
    actor = args[0] if args else ""
    minutes = int(args[1]) if len(args) > 1 else 5
    if actor:
        out(rows("SELECT id, actor, action, details, created_at FROM activity_log WHERE actor = ? AND created_at >= datetime('now', ? || ' minutes') ORDER BY id DESC LIMIT 50", (actor, f"-{minutes}")))
    else:
        out(rows("SELECT id, actor, action, details, created_at FROM activity_log WHERE created_at >= datetime('now', ? || ' minutes') ORDER BY id DESC LIMIT 50", (f"-{minutes}",)))

elif check == "stuck-tasks":
    out(rows("""
        SELECT t.id as task_id, t.status as task_status, t.assigned_to as worker_id,
               t.subject, t.started_at, t.updated_at as task_updated_at,
               w.status as worker_status, w.last_heartbeat, w.pid
        FROM tasks t
        LEFT JOIN workers w ON t.assigned_to = w.id
        WHERE t.status IN ('assigned', 'in_progress')
          AND (
            w.id IS NULL
            OR w.last_heartbeat IS NULL
            OR (julianday('now') - julianday(w.last_heartbeat)) * 86400 > 60
          )
        ORDER BY t.id
    """))

elif check == "stuck-requests":
    out(rows("""
        SELECT id, status, previous_status, tier, created_at, updated_at
        FROM requests
        WHERE status NOT IN ('completed', 'failed')
          AND (julianday('now') - julianday(updated_at)) * 86400 > 120
        ORDER BY updated_at ASC
    """))

elif check == "pipeline-snapshot":
    need(1, "pipeline-snapshot <request_id>")
    req_id = args[0]
    snapshot = {}
    snapshot["request"] = row("SELECT * FROM requests WHERE id = ?", (req_id,))
    tasks_list = rows("SELECT id, status, subject, assigned_to, pr_url, branch, started_at, completed_at, result FROM tasks WHERE request_id = ?", (req_id,))
    snapshot["tasks"] = tasks_list
    worker_ids = {t["assigned_to"] for t in tasks_list if t.get("assigned_to")}
    snapshot["workers"] = [w for wid in worker_ids for w in [row("SELECT id, status, current_task_id, last_heartbeat, pid, backend, launched_at FROM workers WHERE id = ?", (wid,))] if w]
    snapshot["merge_queue"] = rows("SELECT id, task_id, status, pr_url, branch, merged_at, error, failure_class FROM merge_queue WHERE request_id = ?", (req_id,))
    snapshot["recent_activity"] = rows("SELECT id, actor, action, details, created_at FROM activity_log WHERE details LIKE ? ORDER BY id DESC LIMIT 20", (f"%{req_id}%",))
    out(snapshot)

else:
    print("""Usage: e2e-db-check.sh <check-name> [args...]

Available checks:
  request-status <request_id>       Request row
  tasks-for-request <request_id>    All tasks for a request
  task-status <task_id>             Single task row
  worker-state <worker_id>          Worker row with heartbeat/pid
  merge-queue-for-task <task_id>    Merge queue entries for task
  merge-queue-for-request <req_id>  Merge queue entries for request
  loop-state <loop_id>              Loop row
  loop-requests <loop_id>           Requests generated by loop
  research-intent-status <id>       Research intent row
  research-pending-count            Count of active research intents
  browser-job-status <job_id>       Browser job row
  recent-requests [limit]           Most recent requests
  recent-loops [limit]              Most recent loops
  recent-research-intents [limit]   Most recent research intents
  mail-for-recipient <r> [l] [type] Recent mail rows for a recipient
  request-by-description <text>     Requests matching description text
  loop-by-prompt <text>             Loops matching prompt text
  research-intent-by-payload <text> Research intents matching payload text
  master1-debug-snapshot [limit]    Combined request/loop/research/mail/activity snapshot
  recent-activity [actor] [minutes] Recent activity log entries
  stuck-tasks                       Tasks with stale/missing heartbeats
  stuck-requests                    Requests stuck in non-terminal state
  pipeline-snapshot <request_id>    Full pipeline state for a request""", file=sys.stderr)
    sys.exit(1)

conn.close()
PYEOF
