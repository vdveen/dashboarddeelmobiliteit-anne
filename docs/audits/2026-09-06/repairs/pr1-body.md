Sync the five CROW commits missing from the fork, through `c177af35`. This brings in map attribution and the shared control portal, provider CSV exports, and the live public municipality list.

The resolved map conflict retains the fork's vehicle selection tool and the upstream filter layout. SelectionTool now uses the shared control stack. A delayed public municipality response can no longer replace options after login or a newer ACL load.

Validation: 23 focused tests pass across five suites, including upstream CSV checks and four municipality ownership cases. Production build passes with existing reducer fallthrough and bundle-size warnings. Chromium checks at 1440×1000 and 390×844 confirm that the selection panel stays within the viewport and control boxes do not overlap. The browser had no authenticated data and did not load map tiles; full gestures and style transitions remain audit PR 4 work.

This implements audit proposal 1. Tooling cleanup remains proposal 11, and broader ACL request ownership remains proposal 3. Base is the fork's `main`; this PR does not deploy until merged.

Combined validation: the three audit PR branches merge cleanly. The final combined production build passes. Jest has 58 passing tests across 11 suites and the same two inherited suite-loading failures recorded in the audit. See the [repair assessment and remaining work](https://github.com/vdveen/dashboarddeelmobiliteit-anne/blob/audit/fork-code-quality-2026-09-06/docs/FORK-REPAIRS-2026-09-06.md) for details and validation limits.
