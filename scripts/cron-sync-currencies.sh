#!/usr/bin/env bash
# Daily cron wrapper: sync MataUang -> currencies.json, commit & push ONLY if kurs changed.
# Fail-safe: any sync error aborts before commit. Only currencies.json is ever committed
# (path-scoped commit), so unrelated dirty working-tree files are never pushed.
set -uo pipefail

REPO="/home/pusdatinkp/machel-rebuild"
LOGDIR="/home/pusdatinkp/machel-backups/cron-logs"
LOG="$LOGDIR/sync-currencies.log"
mkdir -p "$LOGDIR"

ts() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
log() { echo "[$(ts)] $*" >>"$LOG"; }

cd "$REPO" || { log "FATAL cd $REPO failed"; exit 1; }

log "=== run start ==="

# 1) Sync (fail-safe: leaves currencies.json untouched on error, exits non-zero).
OUT="$(python3 scripts/sync-currencies.py 2>&1)"
RC=$?
log "sync rc=$RC out=$OUT"
if [ "$RC" -ne 0 ]; then
  log "sync failed; aborting (no commit)"
  exit 1
fi

# 2) Commit/push only if currencies.json content actually changed vs HEAD.
if git diff --quiet -- currencies.json; then
  log "no change in currencies.json; nothing to commit"
  log "=== run end (no-op) ==="
  exit 0
fi

log "currencies.json changed; committing"
# Bring remote in first to avoid non-fast-forward; keep only our scoped change.
git fetch origin main >>"$LOG" 2>&1
git commit -m "chore(currency): daily sync currencies.json from MataUang sheet [cron]" -- currencies.json >>"$LOG" 2>&1
CRC=$?
if [ "$CRC" -ne 0 ]; then
  log "commit failed rc=$CRC; aborting"
  exit 1
fi

# Rebase our single commit onto latest origin/main (autostash keeps dirty junk aside).
git pull --rebase --autostash origin main >>"$LOG" 2>&1 || { log "rebase failed; aborting push"; exit 1; }
git push origin main >>"$LOG" 2>&1
PRC=$?
if [ "$PRC" -ne 0 ]; then
  log "push failed rc=$PRC"
  exit 1
fi
log "pushed $(git rev-parse HEAD)"
log "=== run end (pushed) ==="
exit 0
