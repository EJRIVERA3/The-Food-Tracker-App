#!/bin/sh
# Install this repo's git hooks.
#
# Hooks live in .git/hooks/, which git does not clone and does not track.
# For a long time the only copy of them was a fenced block in DEPLOY.md,
# which meant the real hook and the documented hook could drift and only
# a fresh clone would find out. The bodies now live in scripts/hooks/ and
# this copies them into place.
#
#   sh scripts/install-hooks.sh
#
# Safe to re-run. Run it after a fresh clone, and after editing anything
# in scripts/hooks/ — editing the source does nothing until it is copied.

set -e

root="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "not inside a git repository" >&2
  exit 1
}

src="$root/scripts/hooks"
dst="$(git rev-parse --git-path hooks)"

[ -d "$src" ] || { echo "no $src to install from" >&2; exit 1; }
mkdir -p "$dst"

for hook in "$src"/*; do
  [ -f "$hook" ] || continue
  name="$(basename "$hook")"
  cp "$hook" "$dst/$name"
  chmod +x "$dst/$name"
  echo "installed $name"
done

echo ""
echo "post-commit  pushes every commit, so GitHub is never behind this machine."
echo "pre-push     refuses to push when origin has commits this checkout has"
echo "             not seen, and names them. Skip it with --no-verify only"
echo "             when overwriting that work is what you actually mean."
