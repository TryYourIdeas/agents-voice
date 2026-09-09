#!/usr/bin/env bash
# /// script
# dependencies = []
# ///

# Merge a branch into the current branch
# Usage: scripts/merge-branch.sh <branch-name> [--no-ff] [--abort]
# Exit codes:
#   0 - Success
#   1 - Merge conflict
#   2 - Branch not found
#   3 - Failed to merge

set -euo pipefail

BRANCH_NAME=""
NO_FF=false
ABORT=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --no-ff|-n)
            NO_FF=true
            shift
            ;;
        --abort)
            ABORT=true
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
    echo "Usage: scripts/merge-branch.sh <branch-name> [--no-ff] [--abort]" >&2
    exit 1
fi

# Check if branch exists
if ! git rev-parse --verify "$BRANCH_NAME" >/dev/null 2>&1; then
    echo "Error: Branch '$BRANCH_NAME' not found" >&2
    exit 2
fi

if [[ "$ABORT" == "true" ]]; then
    git merge --abort
    echo "Merge aborted"
    exit 0
fi

# Perform the merge
if [[ "$NO_FF" == "true" ]]; then
    git merge --no-ff "$BRANCH_NAME"
else
    git merge "$BRANCH_NAME"
fi

# Check for merge conflicts
if git diff --cached --name-only | grep -q .; then
    echo "Merge conflict detected in the following files:" >&2
    git diff --cached --name-only >&2
    echo "" >&2
    echo "Please resolve conflicts, stage the files with 'git add', and then commit." >&2
    exit 1
fi

echo "Successfully merged branch: $BRANCH_NAME"
exit 0