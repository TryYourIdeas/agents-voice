#!/usr/bin/env bash
# /// script
# dependencies = []
# ///

# Create and switch to a new branch
# Usage: scripts/create-branch.sh <branch-name> [--force]
# Exit codes:
#   0 - Success
#   1 - Branch already exists (unless --force)
#   2 - Failed to create branch

set -euo pipefail

BRANCH_NAME=""
FORCE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --force|-f)
            FORCE=true
            shift
            ;;
        *)
            if [[ -z "$BRANCH_NAME" ]]; then
                BRANCH_NAME="$1"
            else
                echo "Error: Multiple branch names provided" >&2
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

if [[ -z "$BRANCH_NAME" ]]; then
    echo "Error: Branch name is required" >&2
    echo "Usage: scripts/create-branch.sh <branch-name> [--force]" >&2
    exit 1
fi

# Check if branch already exists
if git rev-parse --verify "$BRANCH_NAME" >/dev/null 2>&1; then
    if [[ "$FORCE" == "true" ]]; then
        echo "Branch '$BRANCH_NAME' already exists. Deleting and recreating..." >&2
        git branch -D "$BRANCH_NAME"
    else
        echo "Error: Branch '$BRANCH_NAME' already exists" >&2
        echo "Use --force to delete and recreate" >&2
        exit 1
    fi
fi

# Create and switch to the branch
git checkout -b "$BRANCH_NAME"

echo "Created and switched to branch: $BRANCH_NAME"
exit 0