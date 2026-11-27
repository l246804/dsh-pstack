#!/usr/bin/env bash
# Release: require this release's committed notes file, then bump/tag/push with
# bumpp and clear the consumed notes. The tag keeps the notes so the release
# workflow reads them as the GitHub Release body; deleting after the tag only
# affects later commits.
set -euo pipefail
cd "$(dirname "$0")/.."

for arg in "$@"; do
  case "$arg" in
    -h|--help|-v|--version) exec bumpp "$@" ;;
  esac
done

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

before_head="$(git rev-parse HEAD)"
bumpp "$@"

release_head="$(git rev-parse HEAD)"
release_tag="v$(node -p 'require("./package.json").version')"
if [ "$release_head" = "$before_head" ] ||
   [ "$(git rev-parse --verify --quiet "$release_tag^{commit}")" != "$release_head" ]; then
  echo "No new release commit tagged $release_tag; keeping $NOTES."
  exit 0
fi
# Only follow a push that bumpp actually performed; --no-push and config overrides stay local.
pushed_head="$(git rev-parse --verify --quiet '@{upstream}' || true)"

rm -f "$NOTES"
if git diff --quiet -- "$NOTES"; then
  exit 0
fi
git add -- "$NOTES"
git commit --no-verify -m "chore(release): remove released changes notes" -- "$NOTES"
if [ "$pushed_head" = "$release_head" ]; then
  git push
fi
