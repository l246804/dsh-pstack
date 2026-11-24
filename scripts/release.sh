#!/usr/bin/env bash
# Release: require this release's committed notes file, then bump/tag/push with
# bumpp and clear the consumed notes. The tag keeps the notes so the release
# workflow reads them as the GitHub Release body; deleting after the tag only
# affects later commits.
set -euo pipefail
cd "$(dirname "$0")/.."

NOTES="changes/RELEASE.md"
if [ ! -f "$NOTES" ]; then
  echo "error: $NOTES not found. Author this release's notes first (see changes/AGENTS.md)." >&2
  exit 1
fi
if ! git ls-files --error-unmatch "$NOTES" >/dev/null 2>&1; then
  echo "error: $NOTES is not tracked. Commit it before releasing so the tag includes it." >&2
  exit 1
fi
if ! git diff --quiet HEAD -- "$NOTES"; then
  echo "error: $NOTES has uncommitted or staged changes. Commit it before releasing." >&2
  exit 1
fi

bumpp "$@"

rm -f "$NOTES"
if git diff --quiet -- changes; then
  exit 0
fi
git add -A changes
git commit --no-verify -m "chore(release): remove released changes notes" -- changes
git push
