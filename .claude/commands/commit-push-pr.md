# Commit Locally, Push When Remote Exists

Follow these steps exactly. Do NOT skip the secret check.

## Step 1: Stage Changes

```bash
git add -A
git diff --cached --stat
```

## Step 2: Secret Check

Run `git diff --cached` and scan for:
- API keys, tokens, passwords
- `.env` file contents
- Private keys or certificates

If ANY secrets are found: unstage the affected files and ABORT. Report the issue.

## Step 3: Commit

Use conventional commit format:

```bash
git commit -m "type(scope): concise description"
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`

## Step 4: Rebase on Latest Main When Possible

```bash
if git remote get-url origin >/dev/null 2>&1; then
  git fetch origin main
  git rebase origin/main
else
  echo "No origin remote; keeping local commit on current branch."
fi
```

If conflicts occur and are resolvable, resolve them. Otherwise:

```bash
git rebase --abort
```

And report the conflict.

## Step 5: Push When Remote Exists

```bash
if git remote get-url origin >/dev/null 2>&1; then
  git push origin HEAD
else
  echo "No origin remote; local commit is the deliverable."
fi
```

If rejected because the branch is behind, fetch/rebase and retry once:

```bash
git fetch origin main && git rebase origin/main && git push origin HEAD
```

## Step 6: Create PR

```bash
if git remote get-url origin >/dev/null 2>&1; then
  gh pr create --base main --fill
fi
```

If a PR already exists:

```bash
gh pr view --json url -q '.url'
```

Report the PR URL. This is your deliverable.
