# Working notes for this repo

## Every change is pushed to GitHub
This repo and the IRONCLAD site must be on GitHub before a piece of work is
called finished. A `post-commit` hook in `.git/hooks/` pushes automatically
after every commit; if it reports a failure, run `git push origin <branch>`.
Hooks are not versioned — after a fresh clone, reinstall it (the hook body
is in the IRONCLAD repo's DEPLOY.md, "Backups").

The default branch is `codex/diet-cloud-app`. Production deploys from it.

## Security-sensitive things
- The sync key is a full read/write bearer credential on a user's diary. It
  is read from the `X-Sync-Key` header, never a query string. Do not add a
  fallback.
- `COACH_TOKEN` is a `wrangler secret`. `.dev.vars` is gitignored; keep it so.
