#!/usr/bin/env bash
# /// script
# dependencies = []
# ///

# Reset or revert changes
# Usage: scripts/reset.sh <mode> <commit-hash>
# Modes:
#   soft - Reset to commit, keep changes staged
#   mixed - Reset to commit, keep unstaged changes (default)
#   hard - Reset everything to commit
#   revert - Create a new commit that undoes changes
# Exit codes:
#   0 - Success
#   1 - Invalid arguments or operation failed
#   2 - Commit not found

set -euo pipefail

MODE=""
COMMIT_HASH=""

while [[ $# -gt 0 ]]; do
    case $1 in
        soft)
            MODE="soft"
            shift
            ;;
        mixed)
            MODE="mixed"
            shift
            ;;
        hard)
            MODE="hard"
            shift
            ;;
        revert)
            MODE="revert"
            shift
            ;;
        *)
            if [[ -z "$COMMIT_HASH" ]]; then
                COMMIT_HASH="$1"
            else
                echo "Error: Multiple commit hashes provided" >&2
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

if [[ -z "$MODE" ]]; then
    echo "Error: Mode is required" >&2
    echo "Usage: scripts/reset.sh <mode> <commit-hash>" >&2
    echo "Modes: soft, mixed, hard, revert" >&2
    exit 1
fi

if [[ -z "$COMMIT_HASH" ]]; then
    echo "Error: Commit hash is required" >&2
    exit 1
fi

# Check if commit exists
if ! git rev-parse --verify "$COMMIT_HASH" >/dev/null 2>&1; then
    echo "Error: Commit '$COMMIT_HASH' not found" >&2
    exit 2
fi

case "$MODE" in
    soft)
        git reset --soft "$COMMIT_HASH"
        echo "Reset to $COMMIT_HASH (changes staged)"
        ;;
    mixed)
        git reset --mixed "$COMMIT_HASH"
        echo "Reset to $COMMIT_HASH (changes unstaged)"
        ;;
    hard)
        git reset --hard "$COMMIT_HASH"
        echo "Reset to $COMMIT_HASH (all changes discarded)"
        ;;
    revert)
        git revert "$COMMIT_HASH"
        echo "Reverted commit: $COMMIT_HASH"
        ;;
    *)
        echo "Error: Unknown mode: $MODE" >&2
        echo "Modes: soft, mixed, hard, revert" >&2
        exit 1
        ;;
esac