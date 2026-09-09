#!/usr/bin/env bash
# /// script
# dependencies = []
# ///

# View git history with various options
# Usage: scripts/view-history.sh [options]
# Options:
#   --oneline
#   --graph
#   --decorate
#   --since <date>
#   --author <name>
#   --grep <keyword>
#   --all
#   --limit <number>
# Exit codes:
#   0 - Success
#   1 - Invalid arguments

set -euo pipefail

ONELINE=false
GRAPH=false
DECORATE=false
SINCE=""
AUTHOR=""
GREP=""
ALL=false
LIMIT=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --oneline)
            ONELINE=true
            shift
            ;;
        --graph)
            GRAPH=true
            shift
            ;;
        --decorate)
            DECORATE=true
            shift
            ;;
        --since)
            if [[ -z "$2" ]]; then
                echo "Error: --since requires an argument" >&2
                exit 1
            fi
            SINCE="$2"
            shift 2
            ;;
        --author)
            if [[ -z "$2" ]]; then
                echo "Error: --author requires an argument" >&2
                exit 1
            fi
            AUTHOR="$2"
            shift 2
            ;;
        --grep)
            if [[ -z "$2" ]]; then
                echo "Error: --grep requires an argument" >&2
                exit 1
            fi
            GREP="$2"
            shift 2
            ;;
        --all)
            ALL=true
            shift
            ;;
        --limit)
            if [[ -z "$2" ]]; then
                echo "Error: --limit requires an argument" >&2
                exit 1
            fi
            LIMIT="$2"
            shift 2
            ;;
        *)
            echo "Error: Unknown argument: $1" >&2
            echo "Usage: scripts/view-history.sh [options]" >&2
            echo "Options: --oneline, --graph, --decorate, --since, --author, --grep, --all, --limit" >&2
            exit 1
            ;;
    esac
done

# Build git log command
GIT_LOG="git log"

if [[ "$ONELINE" == "true" ]]; then
    GIT_LOG="$GIT_LOG --oneline"
fi

if [[ "$GRAPH" == "true" ]]; then
    GIT_LOG="$GIT_LOG --graph"
fi

if [[ "$DECORATE" == "true" ]]; then
    GIT_LOG="$GIT_LOG --decorate"
fi

if [[ "$ALL" == "true" ]]; then
    GIT_LOG="$GIT_LOG --all"
fi

if [[ -n "$SINCE" ]]; then
    GIT_LOG="$GIT_LOG --since=\"$SINCE\""
fi

if [[ -n "$AUTHOR" ]]; then
    GIT_LOG="$GIT_LOG --author=\"$AUTHOR\""
fi

if [[ -n "$GREP" ]]; then
    GIT_LOG="$GIT_LOG --grep=\"$GREP\""
fi

if [[ -n "$LIMIT" ]]; then
    GIT_LOG="$GIT_LOG -n $LIMIT"
fi

$GIT_LOG
exit 0