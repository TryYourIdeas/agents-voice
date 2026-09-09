---
name: git-tasks
description: Perform common Git operations including branching, merging, rebasing, committing, and resolving conflicts. Use when users need to manage version control workflows, collaborate on code, or fix repository issues.
license: Apache-2.0
metadata:
  author: agentskills
  version: "1.0"
allowed-tools: Bash(git:*) Read Write
---

# Git Tasks Skill

This skill handles common Git operations and version control tasks. It helps users manage branches, merge changes, rebase history, create commits, and resolve merge conflicts.

## When to Use This Skill

Use this skill when:
- Users want to create, delete, or rename branches
- Users need to merge or rebase branches
- Users want to create or amend commits
- Users need to resolve merge conflicts
- Users want to view Git history or log
- Users need to reset or revert changes
- Users want to stash or unstash changes
- Users need to tag releases

## Common Operations

### Branch Management

#### Creating a Branch
```bash
git branch <branch-name>
git branch -b <branch-name>
```

#### Deleting a Branch
```bash
git branch -d <branch-name>  # Delete and merge if possible
git branch -D <branch-name>  # Force delete
```

#### Renaming a Branch
```bash
git branch -m <old-name> <new-name>
git branch -m <old-name>
```

#### Listing Branches
```bash
git branch              # Local branches
git branch -r           # Remote branches
git branch -a           # All branches
git branch --list       # List all branches
```

#### Checking Out a Branch
```bash
git checkout <branch-name>
git switch <branch-name>  # Newer syntax
```

### Merging and Rebasing

#### Merging Branches
```bash
git merge <branch-name>
git merge --no-ff <branch-name>  # No fast-forward merge
git merge --abort             # Abort a merge
```

#### Rebasing
```bash
git rebase <branch-name>
git rebase --interactive <branch-name>
git rebase --continue         # Continue after conflict resolution
git rebase --abort            # Abort rebase
```

#### Cherry-Picking
```bash
git cherry-pick <commit-hash>
git cherry-pick --no-ff <commit-hash>
```

### Commit Operations

#### Creating a Commit
```bash
git add <file-or-directory>
git add .
git commit -m "commit message"
git commit -m "message line 1" -m "message line 2"
```

#### Amending a Commit
```bash
git commit --amend -m "new message"
git commit --amend --no-edit
```

#### Viewing Commit History
```bash
git log --oneline
git log --graph --all
git log --oneline --decorate
git log --since="1 week ago"
git log --author="username"
```

#### Resetting
```bash
git reset --soft <commit-hash>    # Reset to commit, keep changes staged
git reset --mixed <commit-hash>   # Reset to commit, keep unstaged changes
git reset --hard <commit-hash>    # Reset everything to commit
git reset HEAD~1                  # Go back one commit
```

#### Reverting
```bash
git revert <commit-hash>  # Create a new commit that undoes changes
```

### Stashing Changes

#### Stashing
```bash
git stash
git stash push -m "message"
git stash list
```

#### Applying Stash
```bash
git stash pop
git stash apply
git stash drop
```

### Tagging

#### Creating Tags
```bash
git tag <tag-name>
git tag -a <tag-name> -m "tag message"
git tag -a v1.0.0 -m "Release 1.0.0"
```

#### Listing Tags
```bash
git tag
git tag -l "v*"
```

#### Deleting Tags
```bash
git tag -d <tag-name>
```

### Resolving Conflicts

When merge conflicts occur:

1. **Identify conflicted files:**
   ```bash
   git status
   ```

2. **View conflict markers:**
   ```bash
   cat <conflicted-file>
   ```
   Conflict markers look like:
   ```
   <<<<<<< HEAD
   # Your changes
   =======
   # Their changes
   >>>>>>> branch-name
   ```

3. **Edit the file to resolve conflicts**

4. **Stage the resolved file:**
   ```bash
   git add <file>
   ```

5. **Complete the merge:**
   ```bash
   git commit
   ```

### Advanced Operations

#### Viewing Diff
```bash
git diff <commit-hash>
git diff HEAD~1 HEAD
git diff --cached
git diff --staged
```

#### Viewing Blame
```bash
git blame <file>
git blame --line-porcelain <file>
```

#### Finding Commits
```bash
git log --all --grep="keyword"
git log --all --oneline --since="2024-01-01"
git log --all --author="username" --oneline
```

#### Cleaning Up
```bash
git gc
git reflog expire --expire=now --all
git prune
```

## Examples

### Example 1: Create and Switch to a Feature Branch
```bash
git checkout -b feature/user-authentication
```

### Example 2: Merge Feature Branch
```bash
git checkout main
git merge feature/user-authentication
```

### Example 3: Amend a Commit
```bash
git add src/auth.js
git commit -m "Initial auth implementation"
git add src/auth.js
git commit --amend -m "Initial auth implementation - fixed typo"
```

### Example 4: Resolve a Merge Conflict
```bash
git checkout main
git merge feature/bugfix
# Edit conflicted file to resolve
git add conflicted-file.js
git commit
```

### Example 5: Create a Release Tag
```bash
git tag -a v1.2.0 -m "Release version 1.2.0"
git push origin v1.2.0
```

## Edge Cases and Considerations

### Force Pushing
Force pushing can overwrite remote history:
```bash
git push --force
git push --force-with-lease  # Safer alternative
```

### Dropping a Branch
```bash
git branch -D feature/old-name  # Force delete
```

### Ignoring Remote Tracking
```bash
git fetch --prune
git fetch origin
```

### Viewing Remote Branches
```bash
git branch -r
git remote -v
```

## Best Practices

1. **Always create feature branches** before making changes
2. **Use descriptive commit messages** following conventional commits
3. **Rebase before merging** to maintain a clean history
4. **Test before merging** to avoid introducing bugs
5. **Use `git stash`** to temporarily save work when switching tasks
6. **Review merge conflicts** carefully before committing
7. **Tag releases** with semantic versioning (e.g., v1.0.0)
8. **Use `git reflog`** to recover from accidental commits

## Troubleshooting

### "Your branch is behind 'origin/main'"
```bash
git fetch origin
git rebase origin/main
```

### "Cannot update remote reference"
```bash
git push --force-with-lease
```

### "Merge conflict in multiple files"
Resolve each conflicted file individually, then:
```bash
git add <all-conflicted-files>
git commit
```

### "Stash failed"
```bash
git stash list
git stash drop <stash-index>  # Remove unwanted stash
```