# Repair evidence

The [repair assessment](../../../FORK-REPAIRS-2026-09-06.md) explains the findings and their effect on the remaining proposals. Logs retain the commands and results from the run.

Source paths in `decisions.tsv` refer to these checkouts and PR heads:

- `/home/exedev/dashboard-pr1`: proposal 1, `77319aa2`, GitHub PR #11.
- `/home/exedev/dashboard-pr2`: proposal 2, `1c74f0c4`, GitHub PR #13.
- `/home/exedev/dashboard-pr7`: proposal 7, `8b21ddc2`, GitHub PR #12.
- `/home/exedev/dashboard-repairs-integration`: detached combined tree, final `20bbfd0e`.

Bare log filenames in the trail resolve in this directory. Browser paths `browser/layout.cjs` and `browser/*-controls.png` refer to the copied `browser-layout.cjs` and screenshots here. The working evidence directory was `/tmp/fork-repairs-2026-09-06`. Source references such as `src/...` and `pollTools.js:getOperatorsScopeForStats` refer to the relevant PR source, not this documentation directory.

The browser script is the exact one-off check used for layout evidence. It requires `playwright-core`, Chromium at `/usr/bin/chromium`, the PR 1 production build served on localhost:8444, and its recorded temporary artifact directory. Playwright was installed under the temporary evidence directory; no repository dependency was added. This is not a general end-to-end test runner.

The final integration build follows all source changes. The combined 58-test run at `6013d914` precedes only the final KPI wording change, which has a separate two-test component log. Earlier individual build logs also precede the small final CSS and wording adjustments. Use `integration-build-final.log` for validation of the final combined source.

The two retained failing test suites are recorded in `integration-tests-final.log`. No clean standalone type-check result or authenticated runtime verification is claimed. No transcript path was available.
