# Findings archive

Every audit, bug report, performance report and one-off analysis this fork has
produced, in one place. Dates are the date of the work, not the date the file
was moved here. Nothing here is maintained: read it as a record of what was
true on that day, and check the current code before acting on it.

Start with `2026-09-11/decisions-2026-09-12.md`. It is the most recent
document and it reconciles the three audits that came before it.

## 2026-09-11 — commit audit of the deployed fork

Two independent reviews of the commits that reached `origin/main` in the two
weeks to 11 September, plus the decision list that came out of comparing them.

| File | Date | What it is |
| --- | --- | --- |
| [2026-09-11/decisions-2026-09-12.md](2026-09-11/decisions-2026-09-12.md) | 2026-09-12 | Open decisions reconciled across all three audits, with a recommendation per item. Read this first. |
| [2026-09-11/fable-audit-report.html](2026-09-11/fable-audit-report.html) | 2026-09-11 | Fable's commit audit report. |
| [2026-09-11/FORK-COMMIT-AUDIT-2026-09-11.html](2026-09-11/FORK-COMMIT-AUDIT-2026-09-11.html) | 2026-09-11 | The second model's commit audit report of the same window. |
| [2026-09-11/commit-audit-trail.tsv](2026-09-11/commit-audit-trail.tsv) | 2026-09-11 | Decision trail behind the second report: timestamp, phase, decision, reasoning, evidence, result. |

## 2026-09-06 — full fork code audit and repairs

A code audit of every fork-only commit, the repair PRs that followed, and the
logs each claim rests on.

| File | Date | What it is |
| --- | --- | --- |
| [2026-09-06/FORK-CODE-AUDIT-2026-09-06.md](2026-09-06/FORK-CODE-AUDIT-2026-09-06.md) | 2026-09-06 | The audit report: findings F01 onwards and the numbered repair proposals. |
| [2026-09-06/FORK-REPAIRS-2026-09-06.md](2026-09-06/FORK-REPAIRS-2026-09-06.md) | 2026-09-06 | What the first repair PRs fixed, what they did not, and the revised remaining work. |
| [2026-09-06/commits.tsv](2026-09-06/commits.tsv) | 2026-09-06 | Per-commit ledger: assessment, evidence and proposed PR for every fork-only and incoming upstream commit. |
| [2026-09-06/decisions.tsv](2026-09-06/decisions.tsv) | 2026-09-06 | Decision trail for the audit itself. |
| [2026-09-06/review.md](2026-09-06/review.md) | 2026-09-06 | Independent gpt-5.5 review of the audit trail and its claims. |
| [2026-09-06/evidence/check-context.json](2026-09-06/evidence/check-context.json) | 2026-09-06 | Revision, working directory and command behind each log below. |
| [2026-09-06/evidence/probes.cjs](2026-09-06/evidence/probes.cjs) | 2026-09-06 | Reproduction script for findings F01, F02 and F04 to F07. |
| [2026-09-06/evidence/probes.log](2026-09-06/evidence/probes.log) | 2026-09-06 | Output of that script. |
| [2026-09-06/evidence/jest.log](2026-09-06/evidence/jest.log) | 2026-09-06 | Jest run at the audited revision. |
| [2026-09-06/evidence/python.log](2026-09-06/evidence/python.log) | 2026-09-06 | Python collector tests at the audited revision. |
| [2026-09-06/evidence/build.log](2026-09-06/evidence/build.log) | 2026-09-06 | Production build at the audited revision. |
| [2026-09-06/evidence/tsc.log](2026-09-06/evidence/tsc.log) | 2026-09-06 | `tsc --noEmit` output, which failed at the time. |
| [2026-09-06/evidence/install.log](2026-09-06/evidence/install.log) | 2026-09-06 | Isolated `npm ci --ignore-scripts` run. |
| [2026-09-06/evidence/dependency-audit.json](2026-09-06/evidence/dependency-audit.json) | 2026-09-06 | `npm audit` advisory summary at that lockfile. |
| [2026-09-06/evidence/merge.log](2026-09-06/evidence/merge.log) | 2026-09-06 | Upstream merge rehearsal. |
| [2026-09-06/evidence/resolved-map.diff](2026-09-06/evidence/resolved-map.diff) | 2026-09-06 | The one conflict resolution from that rehearsal, in `MapComponent.tsx`. |
| [2026-09-06/evidence/merged-build.log](2026-09-06/evidence/merged-build.log) | 2026-09-06 | Build of the merged tree. |
| [2026-09-06/evidence/upstream-tests.log](2026-09-06/evidence/upstream-tests.log) | 2026-09-06 | Upstream CSV suites run inside the rehearsal. |
| [2026-09-06/repairs/README.md](2026-09-06/repairs/README.md) | 2026-09-06 | What each repair log and checkout refers to. |
| [2026-09-06/repairs/decisions.tsv](2026-09-06/repairs/decisions.tsv) | 2026-09-06 | Decision trail for the repair round. |
| [2026-09-06/repairs/review.md](2026-09-06/repairs/review.md) | 2026-09-06 | Independent review of the repair round. |
| [2026-09-06/repairs/pr1-body.md](2026-09-06/repairs/pr1-body.md) | 2026-09-06 | PR description for repair proposal 1. |
| [2026-09-06/repairs/pr1-build.log](2026-09-06/repairs/pr1-build.log) | 2026-09-06 | Build for proposal 1. |
| [2026-09-06/repairs/pr1-tests.log](2026-09-06/repairs/pr1-tests.log) | 2026-09-06 | Tests for proposal 1. |
| [2026-09-06/repairs/pr2-body.md](2026-09-06/repairs/pr2-body.md) | 2026-09-06 | PR description for repair proposal 2. |
| [2026-09-06/repairs/pr2-build.log](2026-09-06/repairs/pr2-build.log) | 2026-09-06 | Build for proposal 2. |
| [2026-09-06/repairs/pr2-tests.log](2026-09-06/repairs/pr2-tests.log) | 2026-09-06 | Tests for proposal 2. |
| [2026-09-06/repairs/pr2-ui-final.log](2026-09-06/repairs/pr2-ui-final.log) | 2026-09-06 | Component check after the final wording change in proposal 2. |
| [2026-09-06/repairs/pr7-body.md](2026-09-06/repairs/pr7-body.md) | 2026-09-06 | PR description for repair proposal 7. |
| [2026-09-06/repairs/pr7-build.log](2026-09-06/repairs/pr7-build.log) | 2026-09-06 | Build for proposal 7. |
| [2026-09-06/repairs/pr7-tests.log](2026-09-06/repairs/pr7-tests.log) | 2026-09-06 | Tests for proposal 7, including the malicious-provider popup case. |
| [2026-09-06/repairs/integration-tests.log](2026-09-06/repairs/integration-tests.log) | 2026-09-06 | Combined test run over the three repair branches. |
| [2026-09-06/repairs/integration-tests-final.log](2026-09-06/repairs/integration-tests-final.log) | 2026-09-06 | Final combined test run. |
| [2026-09-06/repairs/integration-build-final.log](2026-09-06/repairs/integration-build-final.log) | 2026-09-06 | Final combined production build. |
| [2026-09-06/repairs/browser-layout.cjs](2026-09-06/repairs/browser-layout.cjs) | 2026-09-06 | Headless browser script measuring control overlap. |
| [2026-09-06/repairs/browser-layout.log](2026-09-06/repairs/browser-layout.log) | 2026-09-06 | Measured element bounds from that script. |
| [2026-09-06/repairs/desktop-controls.png](2026-09-06/repairs/desktop-controls.png) | 2026-09-06 | Map controls at 1440x1000. |
| [2026-09-06/repairs/mobile-controls.png](2026-09-06/repairs/mobile-controls.png) | 2026-09-06 | Map controls at 390x844. |

## 2026-09-07 — merge check for PRs 11 to 13

| File | Date | What it is |
| --- | --- | --- |
| [2026-09-07/README.md](2026-09-07/README.md) | 2026-09-07 | What was merged, which trees matched, and what was checked. |
| [2026-09-07/decisions.tsv](2026-09-07/decisions.tsv) | 2026-09-07 | Decision trail for the merge. |
| [2026-09-07/tests.log](2026-09-07/tests.log) | 2026-09-07 | Test run for the merged release. |
| [2026-09-07/build.log](2026-09-07/build.log) | 2026-09-07 | Production build for the merged release. |

## 2026-09-08 — remaining repair batch, PRs 14 to 21

| File | Date | What it is |
| --- | --- | --- |
| [2026-09-08/README.md](2026-09-08/README.md) | 2026-09-08 | The eight branches, review order and interactions between them. |
| [2026-09-08/decisions.tsv](2026-09-08/decisions.tsv) | 2026-09-08 | Decision trail for the batch. |
| [2026-09-08/pr3-tests.log](2026-09-08/pr3-tests.log) | 2026-09-08 | Tests for proposal 3. |
| [2026-09-08/pr4-tests.log](2026-09-08/pr4-tests.log) | 2026-09-08 | Tests for proposal 4. |
| [2026-09-08/pr5-tests.log](2026-09-08/pr5-tests.log) | 2026-09-08 | Tests for proposal 5. |
| [2026-09-08/pr6-tests.log](2026-09-08/pr6-tests.log) | 2026-09-08 | Tests for proposal 6. |
| [2026-09-08/pr8-tests.log](2026-09-08/pr8-tests.log) | 2026-09-08 | Tests for proposal 8. |
| [2026-09-08/pr8-ui-tests.log](2026-09-08/pr8-ui-tests.log) | 2026-09-08 | UI tests for proposal 8. |
| [2026-09-08/pr9-tests.log](2026-09-08/pr9-tests.log) | 2026-09-08 | Tests for proposal 9. |
| [2026-09-08/pr10-tests.log](2026-09-08/pr10-tests.log) | 2026-09-08 | Tests for proposal 10. |
| [2026-09-08/pr11-tests.log](2026-09-08/pr11-tests.log) | 2026-09-08 | Tests for proposal 11. |
| [2026-09-08/pr11-typecheck.log](2026-09-08/pr11-typecheck.log) | 2026-09-08 | Type check for proposal 11. |
| [2026-09-08/pr11-install.log](2026-09-08/pr11-install.log) | 2026-09-08 | Install run for proposal 11. |
| [2026-09-08/pr11-clean-install.log](2026-09-08/pr11-clean-install.log) | 2026-09-08 | Clean install for proposal 11. |
| [2026-09-08/pr11-iac-install.log](2026-09-08/pr11-iac-install.log) | 2026-09-08 | Install of the Railway config dependencies for proposal 11. |
| [2026-09-08/integration-tests-final.log](2026-09-08/integration-tests-final.log) | 2026-09-08 | Combined test run over the batch. |
| [2026-09-08/integration-typecheck-final.log](2026-09-08/integration-typecheck-final.log) | 2026-09-08 | Combined type check. |
| [2026-09-08/integration-build-final.log](2026-09-08/integration-build-final.log) | 2026-09-08 | Combined production build. |

## history — older reports, superseded in places

Each of these starts with a dated italic line. They were written against the
backend and the code as it stood then.

| File | Date | What it is |
| --- | --- | --- |
| [history/BUGS_SINGLE_OPERATOR_ACCOUNT.md](history/BUGS_SINGLE_OPERATOR_ACCOUNT.md) | 2026-07-07 | Bug report on accounts that can see only one operator's data. |
| [history/PERFORMANCE_API_QUERIES.md](history/PERFORMANCE_API_QUERIES.md) | 2026-07-09 | Performance report on slow vehicle and dashboard API queries. |
| [history/STICHTING-CROW-SOURCE-FINDINGS.md](history/STICHTING-CROW-SOURCE-FINDINGS.md) | 2026-08-24 | Fixes recommended back to the upstream Stichting CROW repository. |

## analysis — one-off output

| File | Date | What it is |
| --- | --- | --- |
| [analysis/amersfoort-vehicle-availability-48h.svg](analysis/amersfoort-vehicle-availability-48h.svg) | 2026-09-09 | Static chart of Amersfoort vehicle availability over 48 hours. Nothing in the app references it. |
| [analysis/voi_non_operational_percentage.png](analysis/voi_non_operational_percentage.png) | 2026-09-11 (first recorded) | Non-operational share of the Voi fleet over time. |

## legacy — inherited instructions

| File | Date | What it is |
| --- | --- | --- |
| [legacy/DEPLOY-upstream-legacy.md](legacy/DEPLOY-upstream-legacy.md) | 2026-09-13 | The Kubernetes, GitLab and database sections removed from `DEPLOY.md`. They describe the upstream hosting, not this fork. |
