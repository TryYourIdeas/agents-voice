#!/usr/bin/env bash
# /// script
# dependencies = []
# ///

# Create and manage tags
# Usage: scripts/tag.sh <command> [options]
# Commands:
#   create <tag-name> [--message <msg>] [--annotate]
#   list [--pattern <pattern>]
#   delete <tag-name>
# Exit codes:
#   0 - Success
#   1 - Invalid arguments or operation failed
#   2 - Tag not found

set -euo pipefail

COMMAND=""
TAG_NAME=""
MESSAGE=""
ANNOTATE=false
PATTERN=""

while [[ $# -gt 0 ]]; do
    case $1 in
        create)
            COMMAND="create"
            shift
            ;;
        list)
            COMMAND="list"
            shift
            ;;
        delete)
            COMMAND="delete"
            shift
            ;;
        --message|-m)
            if [[ -z "$2" || "$2" == --* ]]; then
                echo "Error: --message requires an argument" >&2
                exit 1
            fi
            MESSAGE="$2"
            shift 2
            ;;
        --annotate|-a)
            ANNOTATE=true
            shift
            ;;
        --pattern|-p)
            if [[ -z "$2" ]]; then
                echo "Error: --pattern requires an argument" >&2
                exit 1
            fi
            PATTERN="$2"
            shift 2
            ;;
        *)
            if [[ -z "$TAG_NAME" ]]; then
                TAG_NAME="$1"
            else
                echo "Error: Multiple tag names provided" >&2
                exit 1
            fi
            shift
            ;;
        *)
            echo "Error: Unknown argument: $1" >&2
            exit 1
            ;;
    esac
done

if [[ -z "$COMMAND" ]]; then
    echo "Error: Command is required" >&2
    echo "Usage: scripts/tag.sh <command> [options]" >&2
    echo "Commands: create, list, delete" >&2
    exit 1
fi

case "$COMMAND" in
    create)
        if [[ -z "$TAG_NAME" ]]; then
            echo "Error: Tag name is required for create" >&2
            exit 1
        fi
        if [[ "$ANNOTATE" == "true" ]]; then
            git tag -a "$TAG_NAME" -m "$MESSAGE"
        else
            git tag "$TAG_NAME"
        fi
        echo "Created tag: $TAG_NAME"
        ;;
    list)
        if [[ -n "$PATTERN" ]]; then
            git tag -l "$PATTERN"
        else
            git tag
        fi
        ;;
    delete)
        if [[ -z "$TAG_NAME" ]]; then
            echo "Error: Tag name is required for delete" >&2
            exit 1
        fi
        if ! git rev-parse --verify "$TAG_NAME" >/dev/null 2>&1; then
            echo "Error: Tag '$TAG_NAME' not found" >&2
            exit 2
        fi
        git tag -d "$TAG_NAME"
        echo "Deleted tag: $TAG_NAME"
        ;;
    *)
        echo "Error: Unknown command: $COMMAND" >&2
        echo "Commands: create, list, delete" >&2
        exit 1
        ;;
esac