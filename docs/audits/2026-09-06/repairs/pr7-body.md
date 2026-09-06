Imported provider names and other external popup values previously reached HTML template builders. Live vehicle, zone, and overlapping-hub popups now use DOM nodes and `textContent` with MapLibre `setDOMContent`. Provider links allow HTTP and HTTPS only, colors are assigned through CSS properties, and overlap selection keeps its existing callbacks.

Malformed stop JSON shows an unavailable-data message. Vehicle IDs retain their visibility restriction, actual zero values remain visible, and popup coordinates require finite point coordinates. The unreferenced legacy policy-hub popup module is removed. Static demo popups are outside this change.

Validation: ten focused checks pass, including a malicious CSV provider passed through the actual rental click handler with a mocked MapLibre popup, literal names and IDs, URL schemes, colors, invalid stop data, zero occupancy, and overlap callbacks. Production build passes with inherited warnings. No authenticated browser popup workflow was exercised.

This implements audit proposal 7 and clears proposal 6's popup-safety dependency. CSV parsing, import/filter semantics, historical service-area export, and map event-listener cleanup remain separate work.

Combined validation: the three audit PR branches merge cleanly. The final combined production build passes. Jest has 58 passing tests across 11 suites and the same two inherited suite-loading failures recorded in the audit. See the [repair assessment and remaining work](https://github.com/vdveen/dashboarddeelmobiliteit-anne/blob/audit/fork-code-quality-2026-09-06/docs/FORK-REPAIRS-2026-09-06.md) for details and validation limits.
