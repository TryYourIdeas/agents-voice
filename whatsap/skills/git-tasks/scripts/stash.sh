#!/usr/bin/env bash
# /// script
# dependencies = []
# ///

# Stash changes
# Usage: scripts/stash.sh [--push] [--message <msg>] [--list] [--pop] [--apply] [--drop]
# Exit codes:
#   0 - Success
#   1 - Failed operation
#   2 - No stashes found (for list)

set -euo pipefail

PUSH=false
MESSAGE=""
LIST=false
POP=false
APPLY=false
DROP=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --push|-p)
            PUSH=true
            shift
            ;;
        --message|-m)
            if [[ -z "$2" || "$2" == --* ]]; then
                echo "Error: --message requires an argument" >&2
                exit 2
            fi
            MESSAGE="$2"
            shift 2
            ;;
        --list|-l)
            LIST=true
            shift
            ;;
        --pop)
            POP=true
            shift
            ;;
        --apply)
            APPLY=true
            shift
            ;;
        --drop|-d)
            DROP=true
            shift
            ;;
        *)
            echo "Error: Unknown argument: $1" >&2
            exit 2
            ;;
    esac
done

if [[ "$LIST" == "true" ]]; then
    git stash list
    exit 0
fi

if [[ "$POP" == "true" ]]; then
    git stash pop
    echo "Popped and applied stash"
    exit 0
fi

if [[ "$APPLY" == "true" ]]; then
    git stash apply
    echo "Applied stash"
    exit 0
fi

if [[ "$DROP" == "true" ]]; then
    if [[ -z "$MESSAGE" ]]; then
        git stash drop
    else
        git stash drop "$MESSAGE"
    fi
    echo "Dropped stash"
    exit 0
fi

# Default: stash with optional message
if [[ "$PUSH" == "true" ]]; then
    if [[ -n "$MESSAGE" ]]; then
        git stash push -m "$MESSAGE"
    else
        git stash push
    fi
    echo "Stashed changes"
    exit 0
else
    if [[ -n "$MESSAGE" ]]; then
        git stash push -m "$MESSAGE"
    else
        git stash push
    fi
    echo "Stashed changes"
    exit 0
fi