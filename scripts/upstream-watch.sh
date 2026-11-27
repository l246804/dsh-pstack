#!/usr/bin/env bash
# Report third-party skill sources whose pinned revision is behind upstream.
#
# The source of truth is the `skills` array in skills/package.json. Each entry
# names a GitHub source, a pinned commit, and the skills taken from it. This
# script resolves every named skill to its upstream directory by finding the
# SKILL.md that carries that directory name, then compares the newest commit
# touching that directory at the pin with the newest one on the default branch.
# A directory that moved past the pin is reported.
#
# Adding a new third-party skill source needs no change here: add the entry to
# skills/package.json.
#
# Requires gh (authenticated) and jq. Exits 0 whether or not anything is stale.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

findings=()

report() {
  findings+=("$1")
}

# pstack is pinned by version in native/upstream.lock.json; only its path in the
# monorepo is read, so unrelated plugins in the same repository are ignored.
locked="$(jq -r '.pstackVersion' native/upstream.lock.json)"
upstream="$(curl -fsS --max-time 20 https://raw.githubusercontent.com/cursor/plugins/main/pstack/plugin.json | jq -r '.version')"
if [ "$locked" != "$upstream" ]; then
  report "pstack|$locked|$upstream|https://github.com/cursor/plugins/tree/main/pstack"
fi

# Every third-party skill source declared in skills/package.json.
while IFS= read -r entry; do
  [ -n "$entry" ] || continue
  source="$(jq -r '.source' <<<"$entry")"
  pin="$(jq -r '.ref // empty' <<<"$entry")"

  # Only GitHub sources carry a comparable ref. npm and local sources are skipped.
  case "$source" in
    */*) ;;
    *) continue ;;
  esac
  [ -n "$pin" ] || continue

  owner="$(cut -d/ -f1 <<<"$source")"
  repo="$(cut -d/ -f2 <<<"$source")"
  subpath="$(cut -d/ -f3- <<<"$source")"
  if [ "$subpath" = "$source" ]; then subpath=""; fi

  branch="$(gh api "repos/$owner/$repo" --jq '.default_branch')"
  tree="$(gh api "repos/$owner/$repo/git/trees/$branch?recursive=1" --jq '.tree[].path')"

  while IFS= read -r skill; do
    [ -n "$skill" ] || continue
    # Directories whose own name matches the skill and that carry a SKILL.md.
    dirs="$(printf '%s\n' "$tree" \
      | grep -E "(^|/)${skill}/SKILL\.md$" \
      | sed 's|/SKILL\.md$||' || true)"
    if [ -z "$dirs" ]; then
      report "$skill|$pin|not found|$source"
      continue
    fi
    while IFS= read -r dir; do
      [ -n "$dir" ] || continue
      if [ -n "$subpath" ]; then
        case "$dir" in
          "$subpath"/*) ;;
          *) continue ;;
        esac
      fi
      at_pin="$(gh api "repos/$owner/$repo/commits?path=$dir&sha=$pin&per_page=1" --jq '.[0].sha // empty')"
      now="$(gh api "repos/$owner/$repo/commits?path=$dir&per_page=1" --jq '.[0].sha // empty')"
      if [ -n "$at_pin" ] && [ -n "$now" ] && [ "$at_pin" != "$now" ]; then
        report "$skill|${pin:0:12}|${now:0:12}|https://github.com/$owner/$repo/commits/$branch/$dir"
      fi
    done <<<"$dirs"
  done < <(jq -r '.skills[]' <<<"$entry")
done < <(jq -c '.skills[]' skills/package.json)

if [ "${#findings[@]}" -eq 0 ]; then
  echo "all upstream pins are current"
  exit 0
fi

printf '%s\n' "${findings[@]}"
