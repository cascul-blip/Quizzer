#!/usr/bin/env bash
# Flags casts added since BASE_SHA (CI sets it) or the merge-base with main.
# Tests: no `as never`, and `as unknown as` needs a `// checked:` comment on the line above. src/: any `as <type>` except `as const`, unless the line above starts with `// checked:` saying why it holds.
# Compares against the working tree, so uncommitted edits and untracked files are checked too.
set -euo pipefail
BASE_SHA=${BASE_SHA:-$(git merge-base main HEAD 2>/dev/null || git hash-object -t tree /dev/null)}
if [[ "$BASE_SHA" == 0000000000000000000000000000000000000000 ]]; then
  BASE_SHA=$(git hash-object -t tree /dev/null)
fi
PATHS=('tests/*.ts' 'tests/*.tsx' 'src/*.ts' 'src/*.tsx')
{
  git -c core.quotePath=false diff --no-ext-diff --no-color --src-prefix=a/ --dst-prefix=b/ --unified=0 "$BASE_SHA" -- "${PATHS[@]}"
  # git diff leaves out untracked files: every line of one is new.
  git -c core.quotePath=false ls-files -z --others --exclude-standard -- "${PATHS[@]}" |
    while IFS= read -r -d '' f; do
      git -c core.quotePath=false diff --no-index --no-ext-diff --no-color --src-prefix=a/ --dst-prefix=b/ --unified=0 /dev/null "$f" || true
    done
} |
  awk '
    # The line above, in the working tree, justifies the cast.
    function checked(file, line,    prev, cmd) {
      prev = ""
      if (line > 1) {
        cmd = "sed -n " (line - 1) "p \"" file "\""
        cmd | getline prev
        close(cmd)
      }
      return prev ~ /^[[:blank:]]*\/\/[[:blank:]]*checked:/
    }
    /^diff --git / { in_hunk = 0 }
    /^\+\+\+ b\// { file = substr($0, 7) }
    /^@@ / {
      split($3, range, ",")
      line = substr(range[1], 2)
      in_hunk = 1
      next
    }
    in_hunk && /^\+/ {
      text = substr($0, 2)
      if (file ~ /^tests\//) {
        if (text ~ /(^|[^[:alnum:]_$])as[[:blank:]]+never([^[:alnum:]_$]|$)/) {
          printf "%s:%d: use a type-checked test input in place of as never\n", file, line
          failed = 1
        } else if (text ~ /(^|[^[:alnum:]_$])as[[:blank:]]+unknown[[:blank:]]+as[[:blank:]]/ && !checked(file, line)) {
          printf "%s:%d: an as unknown as cast needs a // checked: comment on the line above saying why it holds (CODING_STANDARDS.md, Checked casts)\n", file, line
          failed = 1
        }
      } else if (text !~ /^[[:blank:]]*(import|export)[[:blank:]].*[[:blank:]]from[[:blank:]]/ && text !~ /^[[:blank:]]*(\/\/|\*|\/\*)/) {
        # Drop string literals so prose like "as many" in a string is not read as a cast.
        gsub(/"([^"\\]|\\.)*"/, "\"\"", text)
        gsub(/\x27([^\x27\\]|\\.)*\x27/, "\"\"", text)
        gsub(/`[^`]*`/, "\"\"", text)
        if (text ~ /[[:alnum:]_$)\]>"\x27]+[[:blank:]]+as[[:blank:]]+[[:alpha:]_{(\[]/ && text !~ /[[:blank:]]as[[:blank:]]+const([^[:alnum:]_$]|$)/) {
          if (!checked(file, line)) {
            printf "%s:%d: a new cast needs a // checked: comment on the line above saying why it holds (CODING_STANDARDS.md, Checked casts)\n", file, line
            failed = 1
          }
        }
      }
      line++
    }
    END { exit failed }
  '
