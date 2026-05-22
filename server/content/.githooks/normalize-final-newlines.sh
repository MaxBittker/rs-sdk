#!/bin/sh

set -eu

cd "$(git rev-parse --show-toplevel)"

mode="${1:---staged}"

case "$mode" in
    --staged)
        git diff --cached --name-only --diff-filter=ACMR -- scripts/ | while IFS= read -r file; do
            if [ ! -f "$file" ]; then
                continue
            fi

            last_byte="$(tail -c 1 "$file" | od -An -t x1 | tr -d '[:space:]')"
            if [ -z "$last_byte" ] || [ "$last_byte" != "0a" ]; then
                printf '\n' >> "$file"
                git add -- "$file"
            fi
        done
        ;;
    --all)
        find scripts -type f | while IFS= read -r file; do
            if [ ! -f "$file" ]; then
                continue
            fi

            last_byte="$(tail -c 1 "$file" | od -An -t x1 | tr -d '[:space:]')"
            if [ -z "$last_byte" ] || [ "$last_byte" != "0a" ]; then
                printf '\n' >> "$file"
            fi
        done
        ;;
    *)
        echo "usage: $0 [--staged|--all]" >&2
        exit 1
        ;;
esac
