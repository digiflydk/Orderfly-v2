#!/usr/bin/env bash
# Process sync for Claude Code sessions (Work agent).
#
# The development process lives on `main` (AGENTS.md, CLAUDE.md,
# docs/development-workflow.md, docs/deployment-flow.md, .claude/).
# A session works on a feature branch that may have been cut before the
# process changed. This hook compares the branch with origin/main and, when
# the process files differ, injects the current version from main into the
# session's context so the newest rules always apply.
#
#   process-sync.sh session   SessionStart (startup, resume, clear, compact)
#   process-sync.sh prompt    UserPromptSubmit: re-checks at most every
#                             PROCESS_SYNC_INTERVAL seconds (default 900)
#
# It never changes the working tree (only `git fetch`) and never blocks the
# session: every failure exits 0 silently. The mid-session check runs when a
# prompt is submitted.

set -u
MODE="${1:-session}"
INTERVAL="${PROCESS_SYNC_INTERVAL:-900}"
FILES=(AGENTS.md CLAUDE.md docs/development-workflow.md docs/deployment-flow.md .claude/settings.json .claude/hooks/process-sync.sh)

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" 2>/dev/null || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0
GIT_DIR="$(git rev-parse --git-dir)"
STAMP="$GIT_DIR/process-sync-fetched"
SEEN="$GIT_DIR/process-sync-seen"
now="$(date +%s)"

if [ "$MODE" = "prompt" ] && [ -f "$STAMP" ]; then
  last="$(cat "$STAMP" 2>/dev/null || echo 0)"
  [ $((now - last)) -lt "$INTERVAL" ] && exit 0
fi

# Stamp before fetching, so an offline session does not pay the fetch timeout on every prompt.
echo "$now" > "$STAMP" 2>/dev/null
if command -v timeout >/dev/null 2>&1; then timeout 20 git fetch --quiet origin main >/dev/null 2>&1 || exit 0
else git fetch --quiet origin main >/dev/null 2>&1 || exit 0; fi
git rev-parse --verify --quiet origin/main >/dev/null || exit 0

existing=()  # AGENTS.md always exists, so the list is never empty
for f in "${FILES[@]}"; do
  if git cat-file -e "origin/main:$f" 2>/dev/null || [ -e "$f" ]; then existing+=("$f"); fi
done

# Fingerprint of the process on main.
main_fp="$(for f in "${existing[@]}"; do git rev-parse --quiet "origin/main:$f" 2>/dev/null || echo none; done | sha1sum | cut -c1-12)"

if [ "$MODE" = "prompt" ]; then
  # Mid-session: speak only when main's process changed since last seen.
  [ "$(cat "$SEEN" 2>/dev/null)" = "$main_fp" ] && exit 0
fi

# Only process changes made on main after this branch was cut count; the
# branch's own edits to these files are its work, not an outdated process.
base="$(git merge-base HEAD origin/main 2>/dev/null)" || exit 0
changed="$(git diff --name-only "$base" origin/main -- "${existing[@]}" 2>/dev/null)"
echo "$main_fp" > "$SEEN" 2>/dev/null

if [ -z "$changed" ]; then
  [ "$MODE" = "session" ] && echo "Process sync: this branch has the current development process from origin/main ($(git rev-parse --short origin/main), process $main_fp)."
  exit 0
fi

main_sha="$(git rev-parse --short origin/main)"
echo "PROCESS UPDATE (process-sync hook)"
echo
echo "The development process on origin/main ($main_sha) differs from this branch in:"
echo "$changed" | sed 's/^/  - /'
echo
echo "The version on origin/main is authoritative and replaces the older rules you loaded"
echo "from this branch. Follow it from now on, also for work already in progress."
echo "Before the next commit, push or PR update, merge origin/main into this branch"
echo "(git merge --no-edit origin/main) so the branch carries the current process."
echo
echo "Read each changed file in full from main now, e.g. git show origin/main:AGENTS.md"
echo
# Hook context is limited, so show the changes, not whole files.
echo "===== Process changes on main since this branch was cut (truncated) ====="
git diff "$base" origin/main -- $changed 2>/dev/null | head -c 8000
echo
echo "===== end diff ====="
exit 0
