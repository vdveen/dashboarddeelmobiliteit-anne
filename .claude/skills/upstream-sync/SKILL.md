---
name: upstream-sync
description: "Review the Stichting-CROW upstream commits this fork is behind on, advise per behaviour change, and merge after the owner approves. Use when asked to check, review, or merge the source repo, the upstream, or Stichting-CROW, or for the weekly upstream check."
---

# Sync the fork with upstream

The fork is `origin` (`vdveen/dashboarddeelmobiliteit-anne`). Upstream is the
`stichting-crow` remote (`Stichting-CROW/dashboarddeelmobiliteit-app`). The
owner is the only user of the fork, which monitors Voi in the Amersfoort and
Gooi en Vechtstreek region. Judge every upstream change by what it does to that
use.

The work has two phases. Phase 1 ends with a report and a stop. Do phase 2 only
after the owner approves in this conversation, and only with the choices they
made. Never push to `stichting-crow` or open a pull request there.

## Phase 1: review and advise

1. Run `git fetch stichting-crow` and `git fetch origin`. List what is new:
   `git log --oneline --no-merges main..stichting-crow/main`. If nothing is new,
   report that in one line with the date of the last upstream merge
   (`git log --merges --first-parent --grep stichting -1 main`) and stop.
2. Read each commit's diff, not only its message. Group the commits by the
   behaviour they change, not by commit.
3. Do a trial merge in a scratch worktree so the main checkout stays clean:
   ```
   git worktree add /tmp/upstream-trial-$(date +%F) main
   cd /tmp/upstream-trial-$(date +%F)
   git merge --no-commit --no-ff stichting-crow/main
   git diff --name-only --diff-filter=U
   ```
   Then run `git merge --abort` and `git worktree remove` on that worktree.
4. Check the fork's known collision points even when git merges them cleanly.
   `AGENTS.md` describes each one:
   - The Servicegebieden overlay (`src/components/MapLayer/DdServiceAreasOverlay.tsx`)
     and the Servicegebieden row in `src/components/SelectLayer/DataLayerList.tsx`.
     The owner keeps the fork's multi-operator overlay. Upstream's single-operator
     dropdown has merged into `DataLayerList.tsx` cleanly before, so check that
     file by hand.
   - The region presets and the place-list order (the ten region municipalities
     and three regions come first).
   - Caps and limits. The owner removed defensive caps (CSV size and row limits,
     ritdata caps) and wants no new ones. Flag any upstream limit.
   - The `/stats/prestaties-aanbieders` route switch in
     `src/pages/dashboard/DashboardPage.tsx` to the Voi contract monitor.
   - `apps/zones/` must keep upstream's place list, so upstream changes to
     `dashboard-api/public/municipalities` handling apply there.
   - Shared code that `apps/hilversum/` and `apps/zones/` import must stay free
     of React, Redux and moment imports.
5. Write the advice. For each behaviour group give:
   - what changes for the owner, in a sentence or two;
   - whether it conflicts with a fork feature, and how hard the conflict is;
   - the recommendation (take, adapt, or skip) and its trade-off.

   Prefer upstream's version for anything the fork does not care about, such
   as signup and account flows. Keep the fork's version where it changed a
   behaviour on purpose. Number the open decisions (1, 2, 3) so the owner can
   answer in shorthand. End with "Waiting for your go-ahead to merge" and stop.

## Phase 2: merge after approval

1. On `main` in the main checkout, check `git status` and `git worktree list`.
   Another agent may be working in the repo. Do not touch its files, and wait
   or ask if it holds `main`.
2. `git merge --no-ff stichting-crow/main`. Never rebase: `main` is published
   and deployed. Name the commit
   `Merge Stichting-CROW/dashboarddeelmobiliteit-app main (YYYY-MM-DD)`.
3. Resolve conflicts the way the owner decided. Recheck the collision points
   from phase 1, step 4.
4. Validate one job at a time, under a memory cap:
   ```
   npm run typecheck
   CI=true systemd-run --user --scope -p MemoryMax=3G -p MemorySwapMax=0 -- npm test -- --watchAll=false
   NODE_OPTIONS=--max-old-space-size=2048 systemd-run --user --scope -p MemoryMax=3G -p MemorySwapMax=0 -- npm run build
   ```
   Exit code 137 means the cap killed the job. Retry with less parallelism
   instead of raising the cap.
5. Push `main` to `origin`. Railway deploys it. Wait until
   `railway deployment list --json` shows the merge commit as `SUCCESS` for
   the web service. Then open the production URL and the pages the merge
   touched.
6. Record new decisions in `AGENTS.md`, under "Merging upstream", when they
   must hold for future merges, as with the overlay note. Commit that with the
   merge or right after it.
7. Report what merged, what was kept from the fork, what was skipped, and
   whether the deploy succeeded.
