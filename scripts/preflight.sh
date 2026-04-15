#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="$REPO_ROOT"
RUN_TESTS=1

usage() {
  echo "Usage: preflight.sh [--project <dir>] [--skip-tests]" >&2
}

while [ $# -gt 0 ]; do
  case "$1" in
    --project)
      PROJECT_DIR="${2:?Missing value for --project}"
      shift 2
      ;;
    --skip-tests)
      RUN_TESTS=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage
      exit 1
      ;;
  esac
done

PROJECT_DIR="$(cd "$PROJECT_DIR" 2>/dev/null && pwd)"
if [ -z "$PROJECT_DIR" ]; then
  echo "preflight: project directory does not exist" >&2
  exit 1
fi

count_nonempty_lines() {
  sed '/^[[:space:]]*$/d' | wc -l | tr -d ' '
}

git_out() {
  git -C "$PROJECT_DIR" "$@" 2>/dev/null || true
}

echo "== mac10 preflight =="
echo "project: $PROJECT_DIR"

branch="$(git_out branch --show-current)"
[ -n "$branch" ] || branch="unknown"
upstream="$(git_out rev-parse --abbrev-ref --symbolic-full-name '@{u}')"
[ -n "$upstream" ] || upstream="none"
head_commit="$(git_out rev-parse --short HEAD)"
[ -n "$head_commit" ] || head_commit="unknown"

echo
echo "== git revision =="
echo "branch: $branch"
echo "upstream: $upstream"
echo "head: $head_commit"

if git -C "$PROJECT_DIR" rev-parse --verify origin/main >/dev/null 2>&1; then
  counts="$(git_out rev-list --left-right --count HEAD...origin/main)"
  ahead="$(printf '%s' "$counts" | awk '{print $1}')"
  behind="$(printf '%s' "$counts" | awk '{print $2}')"
  echo "origin/main: $(git_out rev-parse --short origin/main)"
  echo "ahead: ${ahead:-unknown}"
  echo "behind: ${behind:-unknown}"
else
  echo "origin/main: unavailable"
  echo "ahead: unknown"
  echo "behind: unknown"
fi

dirty_status="$(git_out status --short --untracked-files=normal)"
dirty_count="$(printf '%s\n' "$dirty_status" | count_nonempty_lines)"
echo
echo "== dirty worktree =="
echo "changed paths: $dirty_count"
if [ "$dirty_count" -gt 0 ]; then
  printf '%s\n' "$dirty_status" | sed -n '1,40p'
  if [ "$dirty_count" -gt 40 ]; then
    echo "... truncated; run git status --short --untracked-files=normal for full output"
  fi
fi

tracked_generated="$(git -C "$PROJECT_DIR" ls-files 'status/live-*' '.live-e2e-workspaces/**' 'scripts/__pycache__/**' 2>/dev/null | count_nonempty_lines)"
echo
echo "== generated artifacts =="
echo "tracked generated artifacts: $tracked_generated"

provider_status=0
provider_label="pass"
echo
echo "== provider plugins =="
if [ -f "$REPO_ROOT/scripts/provider-utils.sh" ]; then
  # shellcheck disable=SC1091
  . "$REPO_ROOT/scripts/provider-utils.sh"
  providers="$(mac10_list_provider_ids "$PROJECT_DIR")"
  catalog="$(mac10_list_provider_catalog "$PROJECT_DIR")"
  echo "active providers: ${providers:-none}"
  if [ -n "$catalog" ]; then
    printf '%s\n' "$catalog" | sed 's/^/catalog: /'
  fi
  if mac10_load_provider_config "$PROJECT_DIR"; then
    provider="$MAC10_AGENT_PROVIDER"
    manifest="$MAC10_PROVIDER_MANIFEST_FILE"
    echo "selected provider: $provider"
    echo "selected manifest: $manifest"
    if health_output="$(mac10_provider_health "$PROJECT_DIR" "$provider" 2>&1)"; then
      printf '%s\n' "$health_output" | sed "s/^/${provider} health: /"
    else
      printf '%s\n' "$health_output" | sed "s/^/${provider} health: /"
      provider_status=1
      provider_label="fail"
    fi
    launch_args_file="$(mktemp)"
    export MAC10_AGENT_PROVIDER
    if mac10_load_provider_config "$PROJECT_DIR" \
        && mac10_provider_launch_args noninteractive "$PROJECT_DIR" "$PROJECT_DIR/.claude/commands/loop-agent.md" "$MAC10_LOOP_MODEL" "provider preflight prompt" > "$launch_args_file"; then
      mapfile -d '' -t launch_args < "$launch_args_file"
      echo "$provider launch args: ${#launch_args[@]} args rendered"
      if [ "${#launch_args[@]}" -eq 0 ]; then
        echo "ERROR: $provider launch args rendered empty"
        provider_status=1
        provider_label="fail"
      fi
    else
      echo "ERROR: $provider launch args failed to render"
      provider_status=1
      provider_label="fail"
    fi
    rm -f "$launch_args_file"
  else
    echo "ERROR: selected/default provider manifest missing or disabled"
    provider_status=1
    provider_label="fail"
  fi
else
  echo "ERROR: provider-utils.sh missing"
  provider_status=1
  provider_label="fail"
fi

worktrees="$(git_out worktree list --porcelain)"
total_worktrees="$(printf '%s\n' "$worktrees" | awk '/^worktree /{count++} END{print count+0}')"
root_worker_worktrees="$(printf '%s\n' "$worktrees" | awk '/^worktree / && $2 ~ /\/\.worktrees\// && $2 !~ /\.live-e2e-workspaces\//{count++} END{print count+0}')"
live_e2e_worktrees="$(printf '%s\n' "$worktrees" | awk '/^worktree / && $2 ~ /\.live-e2e-workspaces\//{count++} END{print count+0}')"
prune_output="$(git -C "$PROJECT_DIR" worktree prune --dry-run --verbose 2>&1 || true)"
stale_worktrees="$(printf '%s\n' "$prune_output" | count_nonempty_lines)"

echo
echo "== worktrees =="
echo "registered total: $total_worktrees"
echo "root worker worktrees: $root_worker_worktrees"
echo "live-e2e nested worktrees: $live_e2e_worktrees"
echo "prunable stale registrations: $stale_worktrees"
if [ "$stale_worktrees" -gt 0 ]; then
  printf '%s\n' "$prune_output"
fi

echo
echo "== tests =="
test_status=0
test_label="pass"
if [ "$RUN_TESTS" -eq 1 ]; then
  if [ -d "$PROJECT_DIR/coordinator" ]; then
    (cd "$PROJECT_DIR/coordinator" && npm test)
    test_status=$?
    if [ "$test_status" -ne 0 ]; then
      test_label="fail"
    fi
  else
    echo "coordinator directory missing"
    test_status=1
    test_label="fail"
  fi
else
  echo "skipped (--skip-tests)"
  test_label="skipped"
fi

echo
echo "== preflight result =="
echo "tests: $test_label"
echo "provider plugins: $provider_label"
echo "dirty paths: $dirty_count"
echo "tracked generated artifacts: $tracked_generated"
echo "prunable stale worktrees: $stale_worktrees"

if [ "$test_status" -ne 0 ] || [ "$provider_status" -ne 0 ]; then
  exit 1
fi
exit 0
