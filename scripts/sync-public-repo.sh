#!/usr/bin/env bash
# Pushes integrations/quicktui-dsh, with its history, to the public repository
# that npm's `repository` field and the awesome-dsh-plugin entry point to.
#
# Each monorepo commit that changed the directory becomes one public commit
# with the directory as its root and the same message, author and dates.
# The same history always gives the same commits, so each run fast-forwards
# the public main branch. `git subtree split` does the same but walks the
# whole monorepo history, which takes far too long here.
#
# Usage: sync-public-repo.sh <source ref> [version]
#   source ref  the monorepo commit to publish, normally origin/main
#   version     also push the tag v<version> (the npm version being published)
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "usage: $0 <source ref> [version]" >&2
  exit 2
fi
ref=$1
version=${2:-}
prefix=integrations/quicktui-dsh
remote=${QUICKTUI_DSH_PUBLIC_REMOTE:-https://github.com/dualface/quicktui-dsh.git}
cd "$(git rev-parse --show-toplevel)"

split=""
split_tree=""
# develop and main are linear, so --first-parent sees every change.
for commit in $(git rev-list --reverse --first-parent "$ref" -- "$prefix"); do
  tree=$(git rev-parse --verify --quiet "$commit:$prefix") || continue
  [[ $tree == "$split_tree" ]] && continue
  split=$(
    GIT_AUTHOR_NAME=$(git log -1 --format=%an "$commit") \
    GIT_AUTHOR_EMAIL=$(git log -1 --format=%ae "$commit") \
    GIT_AUTHOR_DATE=$(git log -1 --format=%aI "$commit") \
    GIT_COMMITTER_NAME=$(git log -1 --format=%cn "$commit") \
    GIT_COMMITTER_EMAIL=$(git log -1 --format=%ce "$commit") \
    GIT_COMMITTER_DATE=$(git log -1 --format=%cI "$commit") \
    git commit-tree "$tree" ${split:+-p "$split"} -m "$(git log -1 --format=%B "$commit")"
  )
  split_tree=$tree
done
if [[ -z $split ]]; then
  echo "$prefix does not exist at $ref" >&2
  exit 1
fi
echo "split $ref -> $split"

if [[ -n $version ]]; then
  published=$(git show "$split:package.json" | sed -n 's/^  "version": "\(.*\)",$/\1/p')
  if [[ $published != "$version" ]]; then
    echo "package.json at $ref has version $published, not $version" >&2
    exit 1
  fi
fi
if [[ ${SYNC_DRY_RUN:-} == 1 ]]; then
  echo "dry run: not pushing to $remote"
  exit 0
fi
git push "$remote" "$split:refs/heads/main"
if [[ -n $version ]]; then
  git push "$remote" "$split:refs/tags/v$version"
fi
