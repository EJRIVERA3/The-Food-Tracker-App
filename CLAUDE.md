# Working notes for this repo

## Every change is pushed to GitHub
This repo and the Enlightened Lifter site must be on GitHub before a piece of work is
called finished. A `post-commit` hook in `.git/hooks/` pushes automatically
after every commit; if it reports a failure, run `git push origin <branch>`.
Hooks are not versioned — after a fresh clone, reinstall it (the hook body
is in the Enlightened Lifter repo's DEPLOY.md, "Backups").

The default branch is `codex/diet-cloud-app`. Production deploys from it.

## Two assistants work on these projects. Claude deploys; ChatGPT does not.
Emilio works on the Enlightened Lifter site with ChatGPT as well as
Claude, and the same arrangement covers this repo.

Both may commit and push — git merges, that part is fine. **Deploying is
what collides.** `wrangler deploy` uploads the working tree, so a deploy
from a checkout that is behind silently reverts live to that older state.
Whoever deploys last wins regardless of what is on the branch, and git
gives no hint, because git was never the problem.

It has already happened once on the Enlightened Lifter side: a feature
went live, was overwritten by a deploy from a tree that predated it, and
vanished from the live nav while sitting intact on master.

- **Claude is the only one who runs `npm run deploy:cf`** (or wrangler
  deploy directly).
- **`git pull` immediately before every deploy** — not at the start of a
  session, because the window that matters is while the work was being
  done.
- Check afterwards that the other assistant's most recent work is still
  live, not only your own.

This repo has something specific to lose that way. Its security headers
are added by a Worker wrapper that scripts/patch-deploy-config.mjs wires
in at build time (see server/security-headers.mjs). A deploy from a tree
predating that leaves the app serving people's food diaries with no CSP,
no HSTS and no frame protection — and nothing visible would say so.

## Security-sensitive things
- The sync key is a full read/write bearer credential on a user's diary. It
  is read from the `X-Sync-Key` header, never a query string. Do not add a
  fallback.
- `COACH_TOKEN` is a `wrangler secret`. `.dev.vars` is gitignored; keep it so.
