#!/usr/bin/env bash
# /// script
# dependencies = []
# ///

# Create a commit with a message
# Usage: scripts/commit.sh <message> [--amend] [--no-edit]
# Exit codes:
#   0 - Success
#   1 - No changes to commit
#   2 - Invalid arguments

set -euo pipefail

MESSAGE=""
AMEND=false
NO_EDIT=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --amend|-a)
            AMEND=true
            shift
            ;;
        --no-edit)
            NO_EDIT=true
            shift
            ;;
        *)
            if [[ -z "$MESSAGE" ]]; then
                MESSAGE="$1"
            else
                echo "Error: Multiple messages provided" >&2
                exit 2
            fi
            shift
            ;;
        *)
            echo "Error: Unknown argument: $1" >&2
            exit 2
            ;;
    esac
done

if [[ -z "$MESSAGE" ]]; then
    echo "Error: Commit message is required" >&2
    echo "Usage: scripts/commit.sh <message> [--amend] [--no-edit]" >&2
    exit 2
fi

# Check if there are staged changes
if ! git diff --cached --quiet; then
    if [[ "$AMEND" == "true" ]]; then
        if [[ "$NO_EDIT" == "true" ]]; then
            git commit --amend --no-edit
        else
            git commit --amend -m "$MESSAGE"
        fi
        echo "Amended commit with message: $MESSAGE"
        exit 0
    else
        if [[ "$NO_EDIT" == "true" ]]; then
            git commit -m "$MESSAGE"
        else
            git commit -m "$MESSAGE"
        fi
        echo "Created commit with message: $MESSAGE"
        exit 0
    fi
else
    echo "No changes to commit" >&2
    exit 1
fi