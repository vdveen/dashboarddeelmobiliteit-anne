# Fork code audit, 6 September 2026

Update: proposals 1, 2, and 7 now have implementation PRs. See the [repair results and revised remaining work](FORK-REPAIRS-2026-09-06.md). The findings below preserve the original audit baseline.

The fork is maintainable, but several features need another pass before their results can be trusted under failure or unusual input. The strongest changes are small helpers with clear inputs, the collector's validation and atomic file writes, and the organisation-type correction. The weakest areas are asynchronous state ownership, data interpretation, and integration with shared map and API code.

I recommend eleven bounded PRs. Fix misleading results and unsafe popup rendering first. Keep useful existing tests, repair the broken verification baseline, and add a small number of regression cases at the boundaries where this audit found failures. A framework rewrite or a coverage-percentage target would distract from those fixes.

## Scope and evidence

| Revision | Meaning |
| --- | --- |
| `61830ba8c105a7f13c40eeeeeb7a942950c3f755` | Last source commit before the first fork change on 7 July |
| `d40a67ed` | Published fork `origin/main`, audited production source |
| `f2162fdf` | Local `railway-voi-cron` tip, reviewed separately |
| `035a7d5d` | Most recently merged source revision |
| `c177af35` | Source `stichting-crow/main`, fetched for this audit |

`origin/main` has 47 commits absent from current upstream: 33 ordinary commits and 14 merges. The local cron commit brings the review to 48. Upstream has five commits absent from the fork, comprising three ordinary changes and two merge commits. The final fork delta against the shared upstream ancestor touches 68 files including the local cron work. GitHub snapshot commits on `voi-vehicle-data` are generated data, not application changes; the archive format and publication code were reviewed instead. Unmerged experimental branches and internal checkpoint refs are outside this audit.

The [commit ledger](audits/2026-09-06/commits.tsv) records an assessment for every fork-only commit and all five incoming upstream commits. Review covered their patches, retained code, callers, relevant types, tests, deployment files, and substantive merge resolutions. Superseded implementations are identified in the ledger. Existing upstream code was inspected where the fork depends on it, rather than treating every inherited file as a new fork defect.

The [decision trail](audits/2026-09-06/decisions.tsv) and [reproduction script](audits/2026-09-06/evidence/probes.cjs) preserve the main evidence. The script uses installed TypeScript, React, and jsdom to exercise actual modules with mocked API and map boundaries. It documents current behavior; it is not a new CI suite. Run it from the audited checkout with `node docs/audits/2026-09-06/evidence/probes.cjs`.

[Command context](audits/2026-09-06/evidence/check-context.json) records the revision, working directory, and command for each result log. Checkpoint timestamps record when the log entry was written, not necessarily when the action began. No complete session transcript was available to the separate reviewer.

This is a source audit with targeted execution. No authenticated production API, Railway service, deployed browser session, or backend implementation was exercised. The local build used Node `24.20.0`, npm `12.0.2`, and the existing installed dependencies. The manifest requires exactly `v24.18.0`, so this is not validation on the declared Node version. Browser-specific behavior, actual backend authorization, and historical performance measurements remain subject to the acceptance checks below.

## Quality assessment

| Concern | Assessment |
| --- | --- |
| Readability | Small helpers are generally understandable. The 564-line Voi page combines map construction, caching, playback, loading, and UI. SelectionTool mixes transient gesture state with React render state. New code also repeats inherited `any`, string action names, and imperative global-store patterns. Extract responsibilities where a defect makes ownership unclear; avoid a repository-wide style rewrite. |
| Interoperability | Fork branding and defaults are hardcoded in shared app code. SelectionTool bypasses the map layer and control lifecycle. CSV import uses park events as rental data, while exports now have multiple incompatible CSV helpers. The incoming control portal and CSV utilities provide useful integration points. |
| Robustness | Collector validation is good. Failed requests, old responses, account changes, archive growth, and date conversion are handled unevenly in the frontend. A build success currently says little about these behaviors. |
| Comments and obsolete code | Several comments promise behavior the code does not provide. Historical investigation documents are useful but need dated status and links to current fixes. The cron migration leaves the primary monitor guide describing the old scheduler. |
| Edge cases | Existing focused tests are useful and small. They cover happy paths and some boundaries, but miss failures that change the meaning of displayed results. Add regression cases for these defects instead of large component snapshots or exhaustive combinations. |

## Findings

P1 means fix promptly because the code can display materially wrong results or interpret imported data as executable markup. P2 means a reproducible functional defect or a bounded reliability risk. P3 means maintenance work that can follow the functional fixes. Source locations refer to `d40a67ed` unless a local or upstream revision is named.

### F01. Failed availability requests become a successful 0% KPI, P1

[src/api/beleidszones.ts:237](https://github.com/vdveen/dashboarddeelmobiliteit-anne/blob/d40a67ed/src/api/beleidszones.ts#L237) returns `null` on every non-OK response. [src/helpers/stats/availability-kpi.ts:129](https://github.com/vdveen/dashboarddeelmobiliteit-anne/blob/d40a67ed/src/helpers/stats/availability-kpi.ts#L129) replaces that with an empty values array, then creates a full zero-filled grid at line 148. A failed week in a 90-day request silently lowers the reported availability. If every request fails, the UI still gets a nonempty result and never reaches its `result.length === 0` error message.

The reproduction returned 288 intervals and a 0% KPI for a one-day API failure. This is a confirmed composition bug introduced by the KPI consuming the existing nullable API helper. The same representation also treats genuinely absent observations as measured zero. That policy is documented in the UI, but the audit found no evidence that an omitted bucket always means zero vehicles.

Throw or return an explicit error for failed chunks. Represent unknown observations separately from zero and report coverage. Decide with the API contract whether omitted successful buckets may be zero-filled; until then, do not label an outage as poor operator performance. Proposed PR 2.

### F02. Availability timestamps change the instant and lose DST identity, P1

[src/api/beleidszones.ts:217](https://github.com/vdveen/dashboarddeelmobiliteit-anne/blob/d40a67ed/src/api/beleidszones.ts#L217) formats local clock time and appends `Z`. The existing rental-stat helper does the same. The fork's five-minute helper generates local minute keys without an offset at [src/helpers/stats/availability-kpi.ts:132](https://github.com/vdveen/dashboarddeelmobiliteit-anne/blob/d40a67ed/src/helpers/stats/availability-kpi.ts#L132) and `:149`.

The reproduction supplied `2026-08-01T08:00:00+02:00` and observed an API parameter of `2026-08-01T08:00:00Z`, two hours later than the input instant. Response timestamps carrying an offset are then converted back through the browser timezone. During the autumn clock change, two distinct instants can share the same local key and have their counts added together. The API serialization defect is inherited; the new five-minute KPI makes its consequences more precise and visible.

Use UTC instants for request bounds and sample identity. Apply an explicit `Europe/Amsterdam` timezone only for the reporting window and labels. Confirm the backend's interpretation of its existing timestamps before changing shared charts. The comment that each five-minute MAX bucket is exactly one raw sample also needs API evidence. Proposed PR 2.

### F03. Requests and cached results lack a consistent selection and account identity, P2

[src/components/Chart/BeleidszonesAvailabilityKpi.tsx:73](https://github.com/vdveen/dashboarddeelmobiliteit-anne/blob/d40a67ed/src/components/Chart/BeleidszonesAvailabilityKpi.tsx#L73) keys loaded data by zone and dates, excluding token and operator ACL. It offers no cancellation for its sequential chunk requests. An account or ACL change can therefore leave the old series considered current while the component remains mounted.

The older pollers retained by `2879a315` have related problems. [src/poll-api/pollVerhuringenData.js:201](https://github.com/vdveen/dashboarddeelmobiliteit-anne/blob/d40a67ed/src/poll-api/pollVerhuringenData.js#L201) reuses requests by URL alone, and its module-level `activeRentals` and `existingFilter` are not keyed by account. Clearing CSV import calls `forceUpdateVerhuringenData`, which can reuse cached API data despite the comment promising a refetch. The CSV branch aborts a fetch and sets `theFetch = null` without clearing the loading state; the abort catch then exits because the request is no longer current. Both pollers can process completed data with a newer server-side filter without a final request-identity check.

The incoming municipality loader has another concrete race: upstream `e2146baf`, [src/poll-api/metadataAccessControlList.js:52](https://github.com/vdveen/dashboarddeelmobiliteit-anne/blob/c177af35/src/poll-api/metadataAccessControlList.js#L52), unconditionally dispatches a public list when an earlier guest fetch completes. If login finishes first, that response can overwrite the restricted account's municipality options. This affects UI state; it does not demonstrate a backend authorization bypass.

Give requests an identity that includes server-side filters and authentication scope. Ignore superseded completions and clear caches on account or source changes. Centralize role detection separately from data grants. `getOperatorsScopeForStats` special-cases one ACL operator and requests the public operator list for two or more; validate the multiple-grant contract before changing it. Proposed PR 3, with the new upstream loader guarded in PR 1.

### F04. Lasso drawing restores map dragging during the gesture, P2

[src/components/SelectionTool/SelectionTool.tsx:117](https://github.com/vdveen/dashboarddeelmobiliteit-anne/blob/d40a67ed/src/components/SelectionTool/SelectionTool.tsx#L117) installs gesture handlers in an effect that depends on coordinates and `finishSelection`. Mouse-down disables drag-pan and updates coordinates. That state update cleans up the effect, and line 177 re-enables drag-pan immediately. The jsdom reproduction observed drag-pan enabled after lasso mouse-down.

The layer effect also recreates an empty polygon after a map-style reset and removes only listeners on unmount, leaving sources and layers to the parent lifecycle. Closing the panel or clearing points does not cancel the active mode. The control is mounted in every MapComponent mode but always counts `vehicles.data`, so it can count a previous parking dataset while a rental or service-area layer is displayed. Touch and keyboard completion are absent.

Keep gesture coordinates in refs, install stable handlers, restore interactions when the gesture actually ends, and define cancellation and layer ownership. Limit the control to supported data layers. Adopt upstream's control portal in PR 1, then address interaction behavior in PR 4.

### F05. Public defaults can overwrite shared links and restored choices, P2

[src/App.tsx:408](https://github.com/vdveen/dashboarddeelmobiliteit-anne/blob/d40a67ed/src/App.tsx#L408) applies Voi defaults once operators arrive if `public_defaults_applied` is absent or false. [src/reducers/filter.js:477](https://github.com/vdveen/dashboarddeelmobiliteit-anne/blob/d40a67ed/src/reducers/filter.js#L477) then clears municipality and zone selection unconditionally. The shared-view import at [src/App.tsx:280](https://github.com/vdveen/dashboarddeelmobiliteit-anne/blob/d40a67ed/src/App.tsx#L280) does not give explicit URL choices precedence over that asynchronous default. Old saved states and links from upstream do not contain the new flag.

The reducer reproduction showed a selected municipality and zone being cleared. The exact ordering depends on metadata arrival, so verify both arrival orders in a component regression. Apply edition defaults only to a new, unconfigured session. Keep explicit URL and user choices authoritative. Move Voi selection and province branding into a small edition configuration. Proposed PR 5.

### F06. CSV input is silently altered and its map semantics are ambiguous, P2

[src/helpers/rentalsCsvImport.js:83](https://github.com/vdveen/dashboarddeelmobiliteit-anne/blob/d40a67ed/src/helpers/rentalsCsvImport.js#L83) uses `parseFloat`, which accepts numeric prefixes. Both `52,123` in a semicolon-delimited file and `52garbage` became latitude `52`, with zero rejected rows. The parser splits records on newlines before processing quotes, accepts unmatched quotes, requires time-column headers but accepts missing or invalid times, and loads the entire file on the UI thread without a size limit.

[src/poll-api/pollVerhuringenData.js:153](https://github.com/vdveen/dashboarddeelmobiliteit-anne/blob/d40a67ed/src/poll-api/pollVerhuringenData.js#L153) puts the same park-event points into both rental origins and destinations. The HB layer has its own OD data path and does not consume those points, despite the comment promising visibility in every rentals layer. Other map selections may still suggest a municipality, zone, or trip direction that does not constrain the imported data. The UI discloses only date and distance exceptions.

Define one supported input schema, validate full numeric cells, and either support Dutch decimal commas explicitly or reject them clearly. Explain that these are imported park events and disable unsupported layers and filters. Show rejected-row reasons and a sensible file-size limit. Reuse the API rendering path through a normalized point type instead of a second GeoJSON builder. Proposed PR 6.

### F07. Imported provider names reach an HTML popup builder, P1

The CSV parser accepts arbitrary `system_id` text. `getPrettyProviderName` returns unknown IDs unchanged. [src/components/PrestatiesAanbieders/ProviderLabel.tsx:25](https://github.com/vdveen/dashboarddeelmobiliteit-anne/blob/d40a67ed/src/components/PrestatiesAanbieders/ProviderLabel.tsx#L25) interpolates that value into markup, and [src/components/Map/MapUtils/popups.js:213](https://github.com/vdveen/dashboarddeelmobiliteit-anne/blob/d40a67ed/src/components/Map/MapUtils/popups.js#L213) passes it to `setHTML` when rental points are clicked.

The reproduction imported `<img src=x onerror=alert(1)>` as a provider and showed that the actual label builder creates an `img` element with an event handler. It did not execute an exploit in a deployed browser. A malicious imported file is a concrete input path to the inherited unsafe HTML builder. The earlier SearchBar `setText` fix is good but does not cover these popups.

Construct rich popups with DOM nodes and `textContent`, validate link protocols and colors, and use `setDOMContent`. Include the live vehicle and zone popup paths identified in the existing source findings document. Do not spend this PR converting static demo popups that have no external input. Proposed PR 7.

### F08. Voi selection time and rendered data can disagree, P2

[src/pages/VoiVehicleHistory.tsx:338](https://github.com/vdveen/dashboarddeelmobiliteit-anne/blob/d40a67ed/src/pages/VoiVehicleHistory.tsx#L338) starts loading the selected snapshot but retains the previous `geojson` and map data. The selected timestamp changes immediately. On failure, the old map and count remain while the new timestamp stays selected. Playback at line 375 advances every 900 ms independently of download completion, so slow downloads may never render intermediate snapshots.

Track the selected snapshot separately from the successfully displayed snapshot. Keep map, count, timestamp, loading, and error state consistent. Advance playback when a frame is ready. Retrying should retry the failed frame, rather than refresh the list and jump to its newest entry. Proposed PR 8.

### F09. The Voi viewer retains every downloaded snapshot, P2

[src/pages/VoiVehicleHistory.tsx:254](https://github.com/vdveen/dashboarddeelmobiliteit-anne/blob/d40a67ed/src/pages/VoiVehicleHistory.tsx#L254) stores promises resolving to full decompressed FeatureCollections in an unbounded Map. Every selected or prefetched frame remains until unmount. Long playback therefore grows memory with the archive, and fast scrubbing leaves obsolete downloads running. Both map sources also receive every collection even when one view is hidden.

Use a bounded cache around the active frame, cancel obsolete work, and validate index entries and point geometry at the download boundary. The current checks in [src/api/voiSnapshots.ts:76](https://github.com/vdveen/dashboarddeelmobiliteit-anne/blob/d40a67ed/src/api/voiSnapshots.ts#L76) validate only the collection envelope; malformed index entries can also throw before valid entries are processed. Preserve the useful fixed heatmap parameters, but label the scale as comparable at the same zoom, not as a calibrated number of vehicles per square kilometre. Proposed PR 8.

### F10. The trip histogram hides failed requests and fetches raw trips without a budget, P2

[src/api/trips.js:23](https://github.com/vdveen/dashboarddeelmobiliteit-anne/blob/d40a67ed/src/api/trips.js#L23) parses responses without checking `response.ok`. [src/components/Chart/RitlengteChart.tsx:79](https://github.com/vdveen/dashboarddeelmobiliteit-anne/blob/d40a67ed/src/components/Chart/RitlengteChart.tsx#L79) has `try/finally` without a catch. Network or parsing failure produces an unhandled rejection. A JSON error response becomes an empty dataset; a rejected request can leave the old chart visible under the new filters. Old data also remains visible during a replacement fetch without a loading indicator when `hasData` is true.

The chart fetches all individual trip origins for the selected statistics period. Unlike the availability KPI, it has no period limit, pagination, cancellation, or size budget. Backend response limits and maximum practical periods were not established by this audit. The new chart also inherits the shared statistics date-conversion problem from `createFilterparameters`.

Add explicit loading, empty, and error states with selection identity. Validate distances with `Number.isFinite`, reject malformed responses, and establish a bounded request contract or an aggregate histogram endpoint. Keep the useful percentage helper and its existing tests. Proposed PR 9.

### F11. Service-area export always downloads the current area, P2

[src/components/Filterbar/FilterbarServiceAreas.tsx:194](https://github.com/vdveen/dashboarddeelmobiliteit-anne/blob/d40a67ed/src/components/Filterbar/FilterbarServiceAreas.tsx#L194) calls `loadServiceAreas(municipality, visible_operators)` even when the map shows a historical `version`. The generic button label does not distinguish current geometry from the selected historical view. A network failure in the inherited loader becomes `[]` and is reported as no service areas found.

Either export the selected version with provenance, or label the button explicitly as a current-area export and keep it separate from historical controls. Distinguish unavailable data from an empty result. Reuse the incoming CSV download convention where appropriate, while retaining GeoJSON as a separate format. Proposed PR 6.

### F12. The cron migration needs a verified handover and publication failure cases, P2, local only

`f2162fdf` removes the GitHub Actions schedule before Railway has been demonstrated to run. The code review cannot establish that the required service and token exist. The local `.railway/README.md` itself requires a later apply and a successful published run. Merging the commit without completing that handover can stop hourly collection.

The publisher does useful work: deterministic gzip, snapshot and index in one commit, non-force ref updates, idempotency by path, and retries on status 422. However, `scripts/publish_voi_snapshot.py:215` retries only 422 at the final ref update. Other conflict or transient responses fail the run. The manual workflow still has a second shell publication implementation with no push retry; its concurrency group cannot serialize Railway writes.

The growing index is read through the GitHub Contents API's inline `content` field at line 155. That representation is unsuitable once a file exceeds the API's 1 MB inline-content limit. The current fetched archive has only 21 entries and a 2,712-byte index, so this is a future scaling risk, not a present outage. The viewer also requests the entire index, and Git history retains all snapshots regardless of artifact retention.

Use a staged scheduler handover, one publisher for both entry points, bounded conflict and transient retries, and an index read strategy that survives growth. Define archive retention explicitly and show capture freshness to users. Keep Railway infrastructure tooling separate from the frontend dependency graph if practical. Proposed PR 10. Do not infer that the cron is deployed from the existence of its configuration.

### F13. Verification and dependency maintenance do not provide a reliable baseline, P2

The full Jest command runs 20 tests successfully but two inherited suites fail before running. `NewFeatureIndicator.test.js` imports absent `@reduxjs/toolkit`. `App.test.js` hits an unmocked MapLibre browser API and still asserts the removed CRA "learn react" link. These failures predate the fork.

Standalone `tsc --noEmit` fails on TypeScript 4 parsing the locked `@types/node` 26 declarations and on type annotations in `.jsx` files. The annotation problem is inherited and continued in modified fork files. The build succeeds through its existing Babel configuration, with a fork reducer fallthrough warning and a 5.87 MB main chunk that exceeds the precache limit. Its gzip size is 1.43 MB. There is no PR validation workflow after removal of the obsolete Pages deployment workflow.

The 6 September lockfile audit reports 64 vulnerable dependency entries, including 41 high and 2 critical. These are dependency advisory counts, not 64 demonstrated browser vulnerabilities. Much of the debt is inherited build tooling. Direct entries include obsolete `gh-pages`, the npm CLI installed as an app dependency, and CRA. The unpinned `npx npm-force-resolutions` preinstall step also weakens reproducibility. Do not apply `npm audit fix --force`; the suggested CRA replacement is not a viable migration plan.

Repair the small test baseline, remove unused deployment tooling, constrain compiler and declaration versions, and add a build plus focused-test PR check. Restore useful lint rules for touched code rather than enabling every inherited warning at once. Defer a CRA migration to a separately scoped project. Proposed PR 11.

### F14. Comments and guides overstate guarantees or describe old behavior, P3

| Location | Correction needed |
| --- | --- |
| [src/helpers/stats/availability-kpi.ts:125](https://github.com/vdveen/dashboarddeelmobiliteit-anne/blob/d40a67ed/src/helpers/stats/availability-kpi.ts#L125) | "MAX == the raw value" needs a backend sampling contract. Five-minute aggregation alone does not prove one sample. |
| [src/components/Chart/BeleidszonesAvailabilityKpi.tsx:70](https://github.com/vdveen/dashboarddeelmobiliteit-anne/blob/d40a67ed/src/components/Chart/BeleidszonesAvailabilityKpi.tsx#L70) | The cache comment omits account and ACL scope. |
| [src/components/Filterbar/FilteritemRuweDataImport.jsx:56](https://github.com/vdveen/dashboarddeelmobiliteit-anne/blob/d40a67ed/src/components/Filterbar/FilteritemRuweDataImport.jsx#L56) | Clearing import does not necessarily refetch; the poller can reuse its cache. |
| [src/poll-api/pollVerhuringenData.js:153](https://github.com/vdveen/dashboarddeelmobiliteit-anne/blob/d40a67ed/src/poll-api/pollVerhuringenData.js#L153) | Imported points do not drive the separate HB layer. |
| [src/components/Filterbar/FilteritemMarkers.jsx:116](https://github.com/vdveen/dashboarddeelmobiliteit-anne/blob/d40a67ed/src/components/Filterbar/FilteritemMarkers.jsx#L116) | The denominator includes hidden duration bins, so it is not the currently visible map total. Rounded percentages also need not sum to exactly 100. |
| [src/reducers/filter.js:461](https://github.com/vdveen/dashboarddeelmobiliteit-anne/blob/d40a67ed/src/reducers/filter.js#L461) | "RESET_FILTER is only dispatched right after ... login" couples a generic reducer action to a current caller convention. Express the action's purpose directly. |
| [src/pages/VoiVehicleHistory.tsx:445](https://github.com/vdveen/dashboarddeelmobiliteit-anne/blob/d40a67ed/src/pages/VoiVehicleHistory.tsx#L445) | "Vaste schaal" needs the same-zoom qualification. |
| `docs/VOI-VEHICLE-MONITOR.md:3`, local cron revision | Still says GitHub Actions owns the hourly schedule and every capture is an Actions artifact. Railway publication does neither. |
| `DEPLOY.md:14` and later legacy sections | Separate the existing fork deployment from generic new-project, GitLab, Kubernetes, and backend instructions. |
| `BUGS_SINGLE_OPERATOR_ACCOUNT.md`, `PERFORMANCE_API_QUERIES.md`, `docs/STICHTING-CROW-SOURCE-FINDINGS.md` | Keep dated historical evidence, mark superseded items, and link to current fixes. Do not treat old backend failures or timings as freshly verified. |

Fix comments in the PR that changes the behavior. Put deployment and monitor guide updates in PR 10. Do not delete useful explanations merely because they are long or were written by a model.

## Incoming upstream changes

The rehearsal merged `c177af35` into a detached checkout of `d40a67ed`. Git found one content conflict in `MapComponent.tsx`, at the map container and SelectionTool insertion. The [resolved map diff](audits/2026-09-06/evidence/resolved-map.diff) keeps upstream's `filter-open` class, the fork SelectionTool, the new `IsochroneTools map` prop, and MapAttribution. The rehearsal preserves SelectionTool as a sibling with its current positioning. Moving it into upstream's control portal is additional proposed PR 1 work, followed by the gesture fixes in PR 4. No source merge was applied to the working branch or production.

| Commit | Assessment and integration action |
| --- | --- |
| `40f49ee4` | Attribution and a shared control portal improve the map. Move the fork selection control into that layout and inspect mobile stacking. Attribution HTML currently comes from bundled styles; do not generalize that trust assumption to arbitrary remote content. |
| `192d59ae` | Provider-chart CSV export has explicit columns, decimal precision, BOM, quoting, and missing-value handling. Both new suites pass, 10 tests total. Reuse this utility for future chart exports. Text quoting does not neutralize spreadsheet formulas, so constrain or escape externally supplied textual cells. Filename identity also omits propulsion type. |
| `e2146baf` | A live public municipality list fixes stale guest options. Guard its asynchronous result against login or account changes. The request currently marks metadata loaded before the list arrives and has no retry or empty-success state. |
| `5d47db20` | Merge wrapper for provider CSV exports; no separate fix required. |
| `c177af35` | Merge wrapper for attribution; current upstream tip. |

## Proposed PR sequence

These are proposed scopes, not opened implementation PRs. Each PR should contain its relevant comment updates and a short before/after example in the description. Estimated sizes are review sizes, not delivery promises.

| PR | Proposed title | Scope and dependencies | Acceptance checks |
| --- | --- | --- | --- |
| 1, small to medium | Sync CROW through c177af35 | Resolve the one map conflict, integrate SelectionTool into the control stack, and guard the new public municipality fetch. Keep tooling cleanup in PR 11. | Production build, existing focused suites including the ten upstream CSV tests, and mobile map-control smoke check. One deferred public-response regression. Record the inherited full-suite failures until PR 11 lands. |
| 2, medium, urgent | Preserve availability errors and correct five-minute timestamps | F01 and F02. Explicit error and missing-sample states, UTC sample keys, Amsterdam reporting windows, coverage, duplicate-boundary policy, and a helper-enforced 90-day cap. | One table-driven helper suite covering failed middle chunk, measured zero versus missing, UTC conversion, spring and autumn DST, and duplicate chunk boundaries. Confirm backend timestamp and missing-bucket semantics with a small authenticated sample before rollout. |
| 3, medium | Scope request results and caches to filters and account | F03. Shared request identity and cancellation conventions, poller account invalidation, CSV-to-API loading cleanup, KPI cache scope, and consistent role versus grant handling. Depends on PR 1's municipality guard. | A few deferred-response cases: old filter response, account change, same URL with different auth, and import followed by clear. Manually check one- and multiple-operator grants. |
| 4, small to medium | Make vehicle selection stable across gestures and map changes | F04. Stable handlers, ref-based drawing, cancellation, style restoration, cleanup, supported data-layer gating, and accessible completion. Depends on PR 1's control layout. | One map-stub lifecycle regression plus manual lasso, polygon, Escape, style switch, mobile/touch, and route-change checks. No WebGL snapshot suite. |
| 5, small | Preserve shared-view filters when applying edition defaults | F05. Explicit URL and saved choices take precedence; configure province branding and Voi defaults together. | One precedence table for fresh visitor, saved state, shared view, and login/logout. Exercise both metadata arrival orders. |
| 6, medium | Define CSV import and service-area export semantics | F06 and F11. Strict input schema, row diagnostics, size limit, normalized point adapter, supported import modes, and accurate current-versus-history export labeling. Depends on PR 7's safe popup boundary before accepting arbitrary provider text. | One compact parser table for quoted fields, invalid numerics, decimal commas, times, and line endings. Manual import/filter/clear and historical-export checks. |
| 7, medium, urgent | Render external popup values as text and DOM nodes | F07. Fix live vehicle and zone popup builders, reuse provider-label semantics safely, validate URLs and colors. Can proceed alongside PR 1. | One malicious-text table for labels, vehicle IDs, URLs, and colors. Assert literal text and permitted links, plus a manual imported-point popup check. |
| 8, medium | Keep Voi playback data and timestamps aligned with bounded memory | F08 and F09. Separate requested and displayed frames, loading-aware playback, targeted retry, bounded cache, cancellation, and download validation. Extract archive loading from map rendering. | One deferred-frame regression including failure and retry, a cache-eviction check, and manual slow-network playback and scrub checks with a long index. |
| 9, small to medium | Bound trip histogram requests and show failures accurately | F10. Error and loading states, selection identity, cancellation, finite distance validation, and a documented request limit or aggregate endpoint. Reuse PR 3's request conventions. | Retain percentage tests. Add one HTTP-failure/stale-response case and one bin-boundary table. Compare one chart with a known export, including exact 1 km and 20 km boundaries. |
| 10, medium | Complete and document the Voi cron handover | F12 and deployment-related F14. Amend the local cron work, use one publisher, cover contention and transient errors, fix index growth, define retention and freshness, and update the operator guide. | Retain the eight Python tests. Add focused ref-conflict and retry-exhaustion cases. Verify the Railway plan affects only the collector, then observe a successful scheduled publication before retiring the old schedule. |
| 11, medium | Restore useful PR checks and remove obsolete build dependencies | F13. Repair the two stale suites, remove unused Pages and npm CLI dependencies, replace the unpinned resolution hook, align compiler declarations, and add a build plus test workflow. Establish a scoped type check before expanding it into inherited JSX syntax debt. Can proceed alongside the functional fixes. | Clean install with intended lifecycle scripts, production build, all retained meaningful suites, and type checking of the agreed scope. Confirm PR checks run without deploying. |

Start PRs 1, 2, and 7 first. PR 11 can proceed alongside them. PR 10 is a prerequisite to deploying the local cron change. The remainder can follow in the table's dependency order. The recommended additions are a handful of small regression groups, not a new end-to-end framework or hundreds of generated tests.

## Validation record

| Check | Observed result |
| --- | --- |
| `CI=true npm test -- --watchAll=false --runInBand` | Five suites pass, 20 tests. Two inherited suites fail before execution. [Log](audits/2026-09-06/evidence/jest.log). |
| `python3 -m unittest discover -s scripts -p 'test_*.py' -v` | Eight tests pass at local `f2162fdf`, including four publisher tests unavailable on published main. [Log](audits/2026-09-06/evidence/python.log). |
| `npm run build` | Succeeds with reducer fallthrough and bundle-size warnings at local tip. [Log](audits/2026-09-06/evidence/build.log). |
| `./node_modules/.bin/tsc --noEmit` | Fails on declaration syntax and JSX type annotations. [Log](audits/2026-09-06/evidence/tsc.log). |
| Upstream CSV suites in merge rehearsal | Two suites, ten tests pass using the current installed dependencies. [Log](audits/2026-09-06/evidence/upstream-tests.log). |
| Targeted audit probes | Confirm the specific behaviors in F01, F02, F04, F05, F06, and F07. [Output](audits/2026-09-06/evidence/probes.log). |
| Merge-rehearsal build | Succeeds after the minimal map conflict resolution, using the current installed dependencies. No authenticated runtime behavior was tested. [Log](audits/2026-09-06/evidence/merged-build.log). |
| Isolated `npm ci --ignore-scripts --no-audit` | Succeeds with the local tip's manifest and lockfile. Lifecycle scripts were deliberately skipped, so this does not validate the unpinned preinstall step or a complete Docker build. [Log](audits/2026-09-06/evidence/install.log). |
| Dependency audit | 64 advisory entries at the local lockfile revision. Build-tool and runtime exposure require separate triage. [Summary](audits/2026-09-06/evidence/dependency-audit.json). |

A separate gpt-5.5 review checked the trail and its claims. The [review notes](audits/2026-09-06/review.md) record the corrections and remaining validation limits.
