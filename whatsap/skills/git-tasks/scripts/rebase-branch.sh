#!/usr/bin/env bash
# /// script
# dependencies = []
# ///

# Rebase current branch onto another branch
# Usage: scripts/rebase-branch.sh <branch-name> [--interactive] [--abort] [--continue]
# Exit codes:
#   0 - Success
#   1 - Rebase conflict
#   2 - Branch not found
#   3 - Failed to rebase

set -euo pipefail

BRANCH_NAME=""
INTERACTIVE=false
ABORT=false
CONTINUE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --interactive|-i)
            INTERACTIVE=true
            shift
            ;;
        --abort)
            ABORT=true
            shift
            ;;
        --continue)
            CONTINUE=true
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
    echo "Usage: scripts/rebase-branch.sh <branch-name> [--interactive] [--abort] [--continue]" >&2
    exit 1
fi

# Check if branch exists
if ! git rev-parse --verify "$BRANCH_NAME" >/dev/null 2>&1; then
    echo "Error: Branch '$BRANCH_NAME' not found" >&2
    exit 2
fi

if [[ "$ABORT" == "true" ]]; then
    git rebase --abort
    echo "Rebase aborted"
    exit 0
fi

if [[ "$CONTINUE" == "true" ]]; then
    git rebase --continue
    echo "Rebase continued"
    exit 0
fi

# Perform the rebase
if [[ "$INTERACTIVE" == "true" ]]; then
    git rebase -i "$BRANCH_NAME"
else
    git rebase "$BRANCH_NAME"
fi

# Check for rebase conflicts
if git diff --cached --name-only | grep -q .; then
    echo "Rebase conflict detected in the following files:" >&2
    git diff --cached --name-only >&2
    echo "" >&2
    echo "Please resolve conflicts, stage the files with 'git add', and then run:" >&2
    echo "  scripts/rebase-branch.sh --continue" >&2
    exit 1
fi

echo "Successfully rebased onto branch: $BRANCH_NAME"
exit 0