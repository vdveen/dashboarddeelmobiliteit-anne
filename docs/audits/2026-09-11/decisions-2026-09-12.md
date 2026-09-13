# Open decisions from the three audits

Sources: **F** = Fable report (now `2026-09-11/fable-audit-report.html`). **T** = the other model's report (now `2026-09-11/FORK-COMMIT-AUDIT-2026-09-11.html`, originally from branch `t3code/audit-recent-commits`). **S6** = the 6 September audit and its repair trail (branch `audit/fork-code-quality-2026-09-06`). "Lean" is my recommendation, not a decision.

Where F and T disagree, it is marked. T judged the 8 September repair batch as clean; F reproduced three defects inside it (items 1, 4, 7). Neither is wrong about what it looked at; T did not test those paths.

---

## A. Bugs where the only decision is "fix now or later"

1. **Stuck spinner when changing data layer during a zones load** (F, reproduced). `scopedMetadataStore` drops the `finally` dispatches. Options: (a) drop the `selection() === initial` check and keep only supersession, (b) narrow the selection keys to what the effect re-runs on, (c) exempt `SHOW_LOADING`. Lean: (a).

2. **One malformed vehicle discards a whole snapshot, never retried** (F, reproduced). Options: (a) skip and count bad records, store the count on the snapshot, (b) keep fail-closed but add a backfill command, (c) both. Lean: (c), with (a) first.

3. **Non-defect policy series: one failed day kills the series, only logged to console** (F + T agree). Options: (a) partial results plus visible failed dates, (b) backend aggregate endpoint, (c) leave it. T also flags the daily instant uses browser-local `moment()` rather than Europe/Amsterdam. Lean: (a) now, (b) if you ever touch the backend.

4. **Voi playback prefetch aborts itself** (F only). Options: (a) move the abort out of the effect cleanup so a prefetch survives the index advance, (b) delete the prefetch and rely on the 900 ms gate, (c) leave it. Lean: (a). Also decide `maxFrames = 4` vs something like 30.

5. **Lasso `pointercancel` is treated as completion** (T only). Options: fix when next touching `useMapPolygonDraw`, or now. Lean: when next touching it.

6. **Area chart keeps the previous polygon's "Laatste meting" header while the new request loads** (T only). Lean: clear it; five-minute change.

---

## B. Caps and restrictions added on your behalf (the CSV pattern)

7. **Trip-distance chart: `MAX_TRIP_DAYS = 31`, `MAX_TRIP_BYTES = 10 MB`, `MAX_TRIPS = 50000`** (F + T agree). Four of eight date presets error. Options: (a) delete the day cap, keep byte/error handling, (b) delete all three, (c) keep and hide the presets it cannot serve. Lean: (a).

8. **Voi availability API `MAX_WINDOW_DAYS = 31` and `/index.json` `LIMIT 4501`** (F + T agree). Nine months stored, 31 days queryable. Options: (a) raise the cap, (b) add coarser aggregation (hourly/daily) for long windows and lift the cap, (c) leave and accept. Lean: (b). T additionally notes the timeline itself only ever shows the 7-day default because `listVoiSnapshots()` is called without dates. Decide whether the timeline gets date navigation.

9. **CSV import hides Plaats, Zones, date, duration, distance, direction and the HB layer** (F only; T called this "filter disclosure" and approved it). Options: (a) keep hidden, (b) disable with a one-line note instead, (c) leave visible and let them be inert. Lean: (b).

10. **Voi-only public default never re-applies; a new operator appears on the public map** (F, reproduced; T rated PR #17 "good"). This is a product question. Options: (a) express the default as "keep only Voi" so it self-heals, (b) keep current "apply once, then it is yours" behaviour. Lean: (a), given the fork exists for Voi.

11. **Collector `MAX_POSITIONS = 100000` / `MAX_RESPONSE_BYTES = 20 MB`, snapshot cache 20 MB, polygon 5000 vertices / `MAX_RING_POSITIONS = 1000`** (F sweep). These are far from current sizes (~1000 vehicles). Options: leave, or delete on principle. Lean: leave; they are not in your way.

---

## C. Monitoring visibility (T's main theme; F did not cover)

12. **The Voi page loads `/index.json` once on mount and never discovers new captures** (T). Options: (a) refresh after each ten-minute boundary plus a manual button, (b) manual only, (c) leave. Lean: (a).

13. **Missing captures are drawn as a continuous line** (T; production has a real 15:00/15:10 gap from 11 Sep). Options: (a) insert null rows at expected boundaries so Recharts breaks the line, (b) show "1006 of 1008 expected" only, (c) both. Lean: (c).

14. **No capture time or age shown on the Voi page** although `/health` exposes it (T). Decide whether to surface it. Lean: yes, small.

---

## D. Data pipeline and infrastructure

15. **Retention: 5 GB fills in about nine months, nothing prunes** (S6, F, T all raise it). Options: (a) upgrade Railway plan and raise `sizeMB`, (b) prune positions older than N months but keep snapshot rows, (c) downsample old data, (d) decide later with a capacity alarm. Lean: (d) now, with a hard date to revisit.

16. **Backfill for missed boundaries** (F, T). No command exists. Decide whether to add one. Lean: yes, but item 13 matters more because backfill can also fail.

17. **`collect_voi_vehicles.py` CLI `main()` does not floor timestamps; `voi_database.main()` does** (F). Options: unify, or delete the file-writing CLI now that PostGIS is the only path. Lean: delete the CLI entry point.

18. **Regional hard-coded fallback covers only 3 of the 10 priority municipalities**, so presets vanish if `/public/municipalities` fails (T). Options: extend fallback to all ten, or accept. Lean: extend; it is a list.

---

## E. Verification gaps carried over from the 6 September audit, still open

19. **Backend timestamp and missing-bucket semantics never confirmed with an authenticated sample** (S6, repeated in the repair notes). The KPI's "missing bucket is not zero" policy and the UTC/Amsterdam interpretation rest on docs, not on a comparison against the ordinary zone charts. Decide whether you want to do this comparison once, or accept it.

20. **Multiple-operator-grant contract in `getOperatorsScopeForStats`** (S6). One grant is special-cased; two or more falls back to the public operator list. Never validated against a real multi-grant account. Only matters if you ever use one. Lean: leave, note it.

21. **Upstream `e2146baf` public municipality loader marks metadata loaded before the list arrives and has no retry or empty-success state** (S6). Decide whether to guard it. Lean: low.

22. **Upstream CSV export does not escape spreadsheet formulas in text cells** (S6). Single user, your own exports. Lean: ignore.

23. **Browser check reported `i is not defined` at runtime** (S6 repair review). Never traced. Decide whether to look. Lean: spend ten minutes; an undefined-identifier error in production is worth knowing about.

---

## F. CI and tooling

24. **`check.yml` runs on pull requests only; you push straight to `main` and that deploys** (T). Options: add `push: branches: [main]`, or not. Lean: add it.

25. **Typecheck covers 8 of 286 TypeScript files** (F). Options: (a) add each Voi/new file as you touch it, (b) leave the 8 and call it a lint of pure helpers, (c) attempt whole-tree, which S6 said fails on inherited JSX annotation debt. Lean: (a).

26. **Python tests not in CI; 27 run with stdlib only, 2 suites need psycopg** (F). Lean: add the 27 now.

27. **38 npm advisories (1 critical, 16 high), down from 64, never triaged** (S6, T). Mostly inherited CRA tooling; S6 said do not `audit fix --force`. Options: triage once, or ignore as build-time-only. Lean: one look at the critical, then ignore.

28. **5.9 MB main bundle exceeds the service-worker precache limit** (S6, T). Decide whether you care about offline/PWA behaviour. Lean: you do not; ignore.

29. **`@types/node` pinned to 18 while running Node 24** (F). Cosmetic. Lean: ignore.

---

## G. Documentation (S6 finding F14, mostly still open)

30. **`docs/VOI-VEHICLE-MONITOR.md` still describes GitHub Actions, artifacts and the `voi-vehicle-data` branch** (S6, T). Options: rewrite, or replace with a pointer to `.railway/README.md`. Lean: pointer.

31. **`DEPLOY.md` mixes your Railway deploy with legacy Kubernetes/GitLab/backend sections** (S6). Lean: cut to the Railway section.

32. **`BUGS_SINGLE_OPERATOR_ACCOUNT.md`, `PERFORMANCE_API_QUERIES.md`, `docs/STICHTING-CROW-SOURCE-FINDINGS.md`** are dated evidence never marked superseded (S6). Lean: one "historical, dated X" line at the top of each.

33. **Heatmap "Vaste schaal" label lacks the "at the same zoom" qualification** (S6 F14, still absent). Lean: two words in the label.

34. **Where do the audit reports live?** Three artifacts, three locations: F at repo root untracked, T in `docs/` on an unmerged branch, S6 in `docs/audits/` on another unmerged branch. Options: (a) merge both audit branches and move F into `docs/audits/2026-09-11/`, (b) keep audits out of `main` entirely, (c) keep S6 (it has evidence logs) and drop the rest. Lean: (a); future-you during an incident will want them findable.

---

## H. Repo hygiene

35. **14 stale `origin/claude/*` branches** and `origin/voi-vehicle-data` (the superseded snapshot branch). Delete? Lean: delete all; nothing references them.

36. **`amersfoort-vehicle-availability-48h.svg` tracked at root, unreferenced; `voi_non_operational_percentage.png` untracked at root** (F; T called the SVG harmless). Options: move to `docs/analysis/`, or delete. Lean: move.

37. **`.gitignore` lists both `build` and `/build`** (F). Cosmetic. Lean: ignore.

38. **Branches `t3code/audit-recent-commits` and `audit/fork-code-quality-2026-09-06`** decided by item 34.
