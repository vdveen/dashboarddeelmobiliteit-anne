---
name: voi-monitor-triage
description: "Check, diagnose, fix and backfill the Voi snapshot archive on Railway (voi-vehicle-monitor, voi-snapshot-api, voi-postgis). Use when the collector crashed, a Railway crash email or screenshot arrives, /health is stale, the database looks empty, the lasso or contract monitor charts show gaps, or for the scheduled health check."
---

# Triage the Voi snapshot archive

`voi-vehicle-monitor` is a Railway cron job (`*/10 * * * *`) that stores one
snapshot per ten-minute boundary in `voi-postgis`. `voi-snapshot-api` serves
the data. `.railway/README.md` and the Railway section of `AGENTS.md` explain
how these services behave. Read them before you change anything.

**Time limit.** After each successful run, the collector backfills missed
boundaries, newest first, as far back as the source still answers. In October
2026 that was about 36 hours. A gap older than that is lost for good. If
collection has stopped, getting it running again matters more than anything
else.

## 1. Check health

```
curl -s -A veen-fleet-agent/1.0 https://voi-snapshot-api-production.up.railway.app/health
```

- `stale: false` and `age_seconds` under 1200 means collection works. Also
  check for gaps (step 4) and report `database_bytes`. Above 4 GB, raise
  retention (`AGENTS.md`); the volume is 5 GB.
- `stale: true`, or a missing or non-200 answer, means go to step 2.
- `latest_skipped` above zero means the source sent unusable records. Report
  the count; it is not an outage.

## 2. Diagnose

Run `~/.local/bin/railway whoami` first. If it fails, stop and ask the owner
to run `railway login` (or `railway login --browserless`). Work from the main
checkout, which is linked to the production environment.

Check these in order. Stop at the first one that explains the problem:

1. **The API is down, not the collector.** Run
   `railway deployment list --service voi-snapshot-api --json` and
   `railway service logs --service voi-snapshot-api --lines 50`. A deploy can
   fail with an empty build log while the old deployment keeps serving. Fix it
   with `railway redeploy --service voi-snapshot-api --from-source --yes`.
2. **The cron schedule is gone.** If the collector's logs show no failure but
   runs stopped, run `railway config plan` and look for `deploy.cronSchedule`.
   This happened after the 22 October 2026 Railway incident. `railway config
   apply` restores it. Check that the plan affects only the Voi services and
   the database before you apply it.
3. **The source is failing.** Run
   `railway service logs --service voi-vehicle-monitor --lines 100`. Look for
   `Still failing at ...`. Only the first failed run of an outage crashes and
   sends an email; later runs exit 0. The source's error decides the next step:
   - **HTTP 502, 503 or 500 from `park_events`:** the upstream API is down.
     Nothing to fix here. The backfill fills the gap once it recovers, if it
     recovers within reach. Report it.
   - **HTTP 403:** the API key lost NL-wide Voi access. This happens when a
     municipality grant combines with the Voi grant (see `AGENTS.md`), or the
     key was rotated. You cannot fix that. Tell the owner to have the grant
     changed or to update `DASHBOARDDEELMOB_KEY` in the Railway UI.
   - **A traceback in our code:** fix the bug (step 3).
4. **The deployment has the wrong start command.** A redeploy copies the start
   command from the deployment it copies. The command must be
   `python3 -m scripts.voi_database`. Redeploy from a deployment that has it,
   or deploy a fresh build.
5. **The database is unreachable or full.** Check the `voi-postgis` logs and
   the volume usage in Railway.

To test the source directly, read the key from `/home/exedev/.env` into the
`apikey` header without printing it. Never put the key in a URL, a log line or
a commit.

## 3. Fix

- Code fixes go in `scripts/voi_*.py`. Add any new module to the `COPY` line in
  `Dockerfile.voi-monitor`. Run the tests that need no database:
  `python3 -m unittest scripts.test_collect_voi_vehicles scripts.test_voi_availability scripts.test_voi_reliability`.
  Never run the integration tests against production.
- Commit and push to `origin/main` as `AGENTS.md` describes. Then watch
  `railway deployment list --service voi-vehicle-monitor --json` until the
  push deploys, and read the logs of the next cron run.
- If a quick fix is not possible and the service fails every run, the owner
  has accepted pausing it before. Do not pause it on your own: a pause lets
  the gap pass the backfill limit. Report the trade-off instead.

## 4. Confirm the backfill

After the first successful run, the logs should show
`Backfilled N of M missing snapshots`, or `Backfill stopped at ...` with a
reason. Check for gaps since the outage started:

```
curl -s -A veen-fleet-agent/1.0 "https://voi-snapshot-api-production.up.railway.app/index.json?from=<outage start, ISO UTC>" \
  | python3 -c "import json,sys,datetime as d;t=[d.datetime.fromisoformat(x['captured_at'].replace('Z','+00:00')) for x in json.load(sys.stdin)];[print(a,'->',b) for a,b in zip(t,t[1:]) if b-a>d.timedelta(minutes=10)]"
```

This prints each gap longer than ten minutes. Snapshots before
`TEN_MINUTE_START` in `scripts/voi_database.py` are hourly by design. Report
any gap the backfill could not fill: it was past the source's reach.

## 5. Report

Give the health state, the cause, what you changed (commit, redeploy, config
apply), whether the gap was filled, and anything the owner must do. Then add a
line to the Railway section of `AGENTS.md` if this outage revealed a new failure
mode. The October entries there show the format.

## Scheduled check

When a scheduled task runs this skill and step 1 shows healthy collection with
no gaps in the last 24 hours, reply in a single line with the latest capture and
database size, then settle the thread with the t3-code tool `t3_thread_organize`
(action `settle`, no threadId). Do not dig further. When something is wrong, go through every
step. You may commit code fixes, redeploy, and apply a config plan that touches
only the Voi services. Leave key changes, pausing the service, and deleting
data to the owner. Do not settle the thread when something was wrong.
