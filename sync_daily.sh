#!/bin/zsh
# Daily fixed-block refresh: pull -> sync calendar/routines -> push. Silent; logs to /tmp.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd /Users/moxiaofan/master-board || exit 1
LOG=/tmp/masterboard-sync.log
echo "===== $(date '+%F %T') =====" >> "$LOG"
git pull --rebase origin main >> "$LOG" 2>&1 || echo "pull failed (proxy off?)" >> "$LOG"
python3 sync_fixed.py >> "$LOG" 2>&1
python3 sync.py >> "$LOG" 2>&1
git add -A 2>/dev/null
git diff --cached --quiet || git commit -m "chore: refresh fixed blocks" >> "$LOG" 2>&1
git push >> "$LOG" 2>&1 || echo "push failed" >> "$LOG"
echo "done" >> "$LOG"
