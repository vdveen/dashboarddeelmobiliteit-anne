# Fork repairs and remaining work

Audit proposals 1, 2, and 7 are implemented as separate PRs against `vdveen/dashboarddeelmobiliteit-anne:main`. They are open for review, not merged or deployed. All eight other proposals remain useful. Proposal 3 is smaller, and proposals 4 and 6 now have their prerequisites ready.

Proposal numbers below refer to the [original audit](FORK-CODE-AUDIT-2026-09-06.md), not GitHub PR numbers.

## Delivered changes

| Audit proposal | GitHub PR | Result |
| --- | --- | --- |
| 1 | [#11, CROW sync and map controls](https://github.com/vdveen/dashboarddeelmobiliteit-anne/pull/11) | Includes all five upstream-only commits through `c177af35`. Retains the fork selection tool, moves it into the upstream control portal, and guards delayed public municipality completions after login or a newer ACL load. Head `77319aa2`. |
| 2 | [#13, availability correctness](https://github.com/vdveen/dashboarddeelmobiliteit-anne/pull/13) | Failed or malformed chunks fail the load. Unknown values stay distinct from zero. UTC bucket identity survives DST, the helper enforces 90 days, current incomplete buckets are excluded, and duplicate boundaries have one owner. Account and selection changes abort stale KPI loads. Head `1c74f0c4`. |
| 7 | [#12, DOM popup rendering](https://github.com/vdveen/dashboarddeelmobiliteit-anne/pull/12) | Live vehicle, zone, and hub-selection popups render external values through DOM nodes. Links and colors are validated. Invalid stop JSON has a fallback. The obsolete policy-hub popup module is removed. Head `8b21ddc2`. |

Each branch starts from `d40a67ed`, so the PRs can be reviewed independently. A detached integration checkout merges all three without manual conflict resolution. The small CSS changes in proposals 1 and 7 merge automatically.

## Availability semantics and rollout evidence

The KPI now divides qualifying intervals by intervals with numeric observations for every included provider. It reports measurement coverage separately. A missing bucket, a null value, or an absent included provider does not become a measured zero. CSV exports retain UTC timestamps and use empty cells for unknown observations and incomplete totals.

The UI describes the threshold as a sum of maxima per provider. Those maxima need not occur at the same moment. The percentage therefore does not establish continuous or simultaneous vehicle availability throughout each interval.

The [published zone-statistics documentation](https://docs.dashboarddeelmobiliteit.nl/api_docs/zone_statistics/) uses explicit UTC timestamps but does not guarantee that missing provider keys mean zero. No authenticated API sample was used. Before production rollout, compare a small response with the KPI and ordinary zone parking and rental charts. Include a multiple-provider grant account. Sparse responses can produce low or zero coverage under this conservative policy.

Expected providers still come from `getOperatorsScopeForStats`. If metadata omits a provider entirely, the client cannot know that its values are missing. The existing single-grant versus multiple-grant rule remains proposal 3 work. Coverage must not be treated as independent proof that the backend returned the full authorized provider set.

Proposal 2 also corrects UTC serialization in the shared zone availability and rental endpoints and interprets their selected calendar days in Amsterdam. Request-level checks cover both endpoints. Their ordinary-chart nullable HTTP-error fallback remains in place. The KPI uses its own abort signal without cancelling a shared deduplicated request.

## Impact on the remaining proposals

| Proposal | Revised scope | Dependency and validation impact |
| --- | --- | --- |
| 3, request and account identity | Remove the five-minute KPI's stale-result and cancellation work, and retain proposal 1's public municipality guard. Still fix shared pollers, deduplication/cache identity, old ACL and public-operator completions, import-to-API loading cleanup, and role versus grant handling. | Start from proposals 1 and 2 when they merge. Reuse their ownership approach where appropriate, but do not assume it fixes other loaders. Concentrate checks on old filters, changed accounts, identical URLs with different authorization, import/clear, and multiple grants. |
| 4, selection interaction | Control placement is done. Stable gesture handlers, lasso refs, drag restoration, Escape/cancellation, style and route cleanup, layer gating, and accessible completion remain. Existing popup listener lifecycle issues also remain. | Base on proposal 1. Desktop/mobile bounds checks do not verify drawing or touch behavior. Keep the planned compact lifecycle regression and manual gesture checks. |
| 5, public defaults | Unchanged. Explicit URL filters and saved choices still need precedence over public defaults, including province branding and Voi defaults. | Exercise both municipality/operator metadata arrival orders after proposal 1. A safe request completion does not establish correct default precedence. |
| 6, CSV import and historical export | The unsafe popup dependency is resolved by proposal 7. Strict record parsing, row diagnostics, size limits, point normalization, import/filter semantics, and current-versus-historical service-area export remain. | Start after proposal 7 merges. Reuse proposal 1's CSV quoting utilities where compatible. Preserve proposal 2's explicit UTC and unknown-value export contract; quoting alone does not define an import schema or historical semantics. |
| 8, Voi playback | Unchanged. Requested versus displayed frame identity, failures/retries, bounded cache, cancellation, and archive validation remain. | Use proposal 2's stale-completion pattern as a reference. Keep Voi frame loading separate from zone-statistics time handling. |
| 9, trip histogram | Request budgets, visible failures, stale-result handling, distance validation, and bin boundaries remain. | Reuse proposal 3's eventual request conventions and proposal 2's UTC helper where the API contract matches. The separate `createFilterparameters` timestamp path is still unchanged. Keep the proposed HTTP/stale-response case and boundary table. |
| 10, cron handover | Unchanged. Shared publication logic, bounded conflict/transient retries, index growth, retention, freshness, and deployment documentation remain. | The original `railway-voi-cron` checkout remains untouched. Verify the handover before retiring the old schedule. These frontend PRs provide no evidence that the Railway cron is deployed. |
| 11, tooling and dependencies | Unchanged in substance. Repair the two stale suites, align compiler/declaration versions, remove obsolete dependencies and unpinned hooks, and add non-deploying PR checks. | Include the newly retained focused suites in CI. No dependency or lockfile changes were needed for these repairs. A production build does not establish a clean standalone type check or clean install. |

Keep comment cleanup with the affected implementation. Proposals 2 and 7 remove inaccurate measurement claims and obsolete HTML-popup code. They do not close audit finding F14 across deployment guides and other modules.

I recommend reviewing proposals 7 and 1 first, then proposal 2 with the API comparison above. Next, work on proposals 11 and 3. Proposals 4 and 6 can then use the accepted control and popup code. Proposal 10 remains a prerequisite whenever the cron deployment resumes. Proposals 5, 8, and 9 retain their original scope and priority.

## Verification and limits

| Check | Evidence and result |
| --- | --- |
| Focused proposal 1 checks | [Log](audits/2026-09-06/repairs/pr1-tests.log). Five suites, 23 tests pass. Includes upstream CSV and public municipality ownership checks. |
| Focused proposal 2 checks | [Log](audits/2026-09-06/repairs/pr2-tests.log). Two suites, 14 tests pass. Covers failures, unknowns, DST, bounds, cancellation, and both real API request functions with mocked transport. |
| Focused proposal 7 checks | [Log](audits/2026-09-06/repairs/pr7-tests.log). Ten tests pass. An imported malicious provider reaches the actual rental click handler with a mocked MapLibre popup. Other cases cover names, IDs, link schemes, colors, stop data, and overlap callbacks. |
| Combined Jest run | [Log](audits/2026-09-06/repairs/integration-tests-final.log). Eleven suites pass, 58 tests. Two inherited suites fail before test execution: `App.test.js` lacks MapLibre's `URL.createObjectURL`, and `NewFeatureIndicator.test.js` imports missing `@reduxjs/toolkit`. Run at integration `6013d914`; the final UI wording change has a separate passing [component check](audits/2026-09-06/repairs/pr2-ui-final.log). |
| Production builds | Individual proposal builds pass. Final integration build at `20bbfd0e` is recorded in [this log](audits/2026-09-06/repairs/integration-build-final.log). Existing reducer fallthrough and bundle-size warnings remain. |
| Browser layout | [Script](audits/2026-09-06/repairs/browser-layout.cjs), [bounds log](audits/2026-09-06/repairs/browser-layout.log), [desktop](audits/2026-09-06/repairs/desktop-controls.png), and [mobile](audits/2026-09-06/repairs/mobile-controls.png). The selection panel stays in the viewport and control boxes do not overlap at 1440×1000 and 390×844. |

The browser check was limited to layout. Map tiles did not load, there was no authenticated data, and the page reported `i is not defined`. It does not establish a clean end-to-end map, import-popup, touch, route, or style-switch workflow.

Validation used the existing installed dependencies, Node `v24.20.0` and npm `12.0.2`. The manifest requests Node `v24.18.0`. This run did not repeat the audit's clean-install or standalone TypeScript checks, and does not claim they are fixed. No permanent browser framework or dependency was added. Of the 38 additional passing tests versus the original 20-test baseline, ten come from upstream and 28 are focused repair cases across four new suites.

The [decision trail](audits/2026-09-06/repairs/decisions.tsv) and [independent review](audits/2026-09-06/repairs/review.md) record the evidence and remaining cautions. No transcript path was available for a transcript-to-trail comparison.
