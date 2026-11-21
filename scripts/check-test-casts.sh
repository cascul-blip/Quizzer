#!/usr/bin/env bash
# Flags `as never` added to tests since BASE_SHA (CI sets it) or the merge-base with main.
# Compares against the working tree, so uncommitted edits are checked too.
set -euo pipefail
BASE_SHA=${BASE_SHA:-$(git merge-base main HEAD 2>/dev/null || git hash-object -t tree /dev/null)}
if [[ "$BASE_SHA" == 0000000000000000000000000000000000000000 ]]; then
  BASE_SHA=$(git hash-object -t tree /dev/null)
fi
git -c core.quotePath=false diff --no-ext-diff --no-color --src-prefix=a/ --dst-prefix=b/ --unified=0 "$BASE_SHA" -- 'tests/*.ts' 'tests/*.tsx' |
  awk '
    /^diff --git / { in_hunk = 0 }
    /^\+\+\+ b\// { file = substr($0, 7) }
    /^@@ / {
      split($3, range, ",")
      line = substr(range[1], 2)
      in_hunk = 1
      next
    }
    in_hunk && /^\+/ {
      if ($0 ~ /(^|[^[:alnum:]_$])as[[:blank:]]+never([^[:alnum:]_$]|$)/) {
        printf "%s:%d: use a type-checked test input in place of as never\n", file, line
        failed = 1
      }
      line++
    }
    END { exit failed }
  '
