# Remaining audit repairs, 2026-09-08

Eight branches implement the remaining revised proposals against fork main `ed995768`. The latest authenticated ten-minute Voi collector, polygon availability API, 5 GB volume cap and unknown-status handling are included. Proposals 1, 2 and 7 remain merged. These eight new PRs are for review and have not been merged or deployed.

## Review order and interactions

Review proposal 11 first. Its clean dependency tree and repaired test setup provide the common validation baseline. Proposal 3 owns account and request cleanup, including the transition from CSV back to API data. Proposal 6 owns CSV parsing, display semantics and direction restoration. Proposals 3 and 4 both edit MapComponent, but their changes merge automatically. Proposals 5 and 6 both edit state persistence; the combined code preserves explicit filters and omits the temporary CSV direction override.

Proposals 8 and 10 both use the current snapshot API. Proposal 8 bounds the completed browser cache and validates frames. Proposal 10 bounds database reads and reports freshness. The browser cache's 20 MB budget does not cap network response bytes or JavaScript heap usage. Proposal 9 uses independent caller cancellation and the shared Amsterdam calendar helpers. There are no remaining unbuilt proposals in the original list.

## Pull requests

- Proposal 11: [#14](https://github.com/vdveen/dashboarddeelmobiliteit-anne/pull/14)
- Proposal 3: [#15](https://github.com/vdveen/dashboarddeelmobiliteit-anne/pull/15)
- Proposal 4: [#16](https://github.com/vdveen/dashboarddeelmobiliteit-anne/pull/16)
- Proposal 5: [#17](https://github.com/vdveen/dashboarddeelmobiliteit-anne/pull/17)
- Proposal 6: [#18](https://github.com/vdveen/dashboarddeelmobiliteit-anne/pull/18)
- Proposal 8: [#19](https://github.com/vdveen/dashboarddeelmobiliteit-anne/pull/19)
- Proposal 9: [#20](https://github.com/vdveen/dashboarddeelmobiliteit-anne/pull/20)
- Proposal 10: [#21](https://github.com/vdveen/dashboarddeelmobiliteit-anne/pull/21)

## Branches

| Proposal | Change | Head |
| --- | --- | --- |
| 3 | Scope requests and cached data to account and selection | `8644c1eb` |
| 4 | Stabilize map selection gestures and popup cleanup | `87c87a15` |
| 5 | Preserve explicit filters before public edition defaults | `72c70783` |
| 6 | Validate CSV parking imports and clarify service-area exports | `9620de9a` |
| 8 | Keep Voi playback labels aligned with displayed frames | `c1eaa231` |
| 9 | Bound trip histogram requests and show load failures | `cedc1657` |
| 10 | Bound PostGIS snapshot reads and retry transient writes | `59c2aa0b` |
| 11 | Restore repeatable frontend checks and isolate Railway tooling | `23e3173e` |

## Validation and limits

The combined checkout merges all eight branches without manual conflict resolution. Full Jest: 22 suites and 89 tests pass. Scoped TypeScript checks pass. The production build passes with inherited warnings; see [build log](integration-build-final.log). Validation ran at `6e7b57d2`; the final integration head `2e8387fe` adds only a dependency-directory ignore rule. Individual branches use their targeted suites; full clean validation uses all eight changes together, including proposal 11.

A clean frontend install passed on Node 24.20.0 and npm 12.0.2. This VM has a global install-script restriction; the rerun explicitly allowed core-js, core-js-pure and maplibre-gl through a temporary local .npmrc, removed afterward. The initial attempted command-line override was rejected by npm before installation. The isolated Railway package also installs and `railway/iac` resolves. Existing dependency deprecations remain. Standalone whole-source TypeScript cleanup is outside proposal 11; `tsconfig.checked.json` names the modules checked.

Proposal 10 passes 37 Python tests, including integration against a disposable local PostGIS database. No Railway authentication, deployment, production writes or retention changes occurred. The current 5 GB volume holds roughly nine months at about 6 GB/year. Retention is indefinite; monitor capacity and separately decide on an upgrade or pruning.

The map lifecycle and Voi page tests use mocks. They do not establish real-device touch, full map style switching or authenticated workflows. The earlier browser layout check had missing tiles and an inherited runtime error; it is not reused as end-to-end evidence. Multi-grant ACL/API comparison and conservative missing-provider coverage semantics still require authenticated verification before rollout. Histogram tests establish request budgets and percentage behavior, not every rendered-chart interaction.

The first combined build found a missing search-parameter hook in the historical export guard. That hook is fixed. Final review also added the missing CSV filter memo dependency, restored the pre-import direction in persisted state, refreshed popup ownership when the role/user changes, and released loading before an authentication failure clears its owner. An additional observation test checks one point per row, stable IDs and provider filtering.

## Attention

reviewed by gpt-5.5

The reviewer spot-checked proposals 3, 6, 8 and 10 and found no blocking implementation issue. The stale failing PR8 test log is superseded by `pr8-ui-tests.log` and `integration-tests-final.log`. A stray README heading was removed. The reviewer highlighted dependency-tree consistency and the deliberately scoped typecheck. No transcript path was available, so the review compares the trail with diffs and saved artifacts, not the full conversation transcript.

Saved evidence: [Jest](integration-tests-final.log), [typecheck](integration-typecheck-final.log), [PostGIS](pr10-tests.log), [clean install](pr11-clean-install.log), [IaC install](pr11-iac-install.log), [Voi page rerun](pr8-ui-tests.log), and [decision trail](decisions.tsv).
