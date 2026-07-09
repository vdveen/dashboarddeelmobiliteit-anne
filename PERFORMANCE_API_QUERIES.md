# Performance report: slow vehicle / dashboard API queries

Findings and fixes for the Dashboard Deelmobiliteit developers (Stichting CROW),
collected while profiling this fork (`vdveen/dashboarddeelmobiliteit-anne`) to
understand why loading the vehicles map and the dashboards feels slow.

**Date:** 2026-07-08

## Summary

Loading the map is slow for two independent reasons, roughly equal in weight:

1. **The frontend downloaded the ~2.5 MB vehicles payload 2–3 times per page
   load**, aborting all but the last attempt. This is fixed in this fork
   (commit `2879a31`) — the page now issues **exactly one** vehicles request,
   halving API bandwidth and backend query load per visit.
2. **The backend itself is the remaining bottleneck**: it serves **2.5 MB of
   uncompressed JSON** (gzip would be ~9× smaller) and takes **~0.9–1.7 s** of
   server time per query. After the frontend fix, the leftover load time is
   >90 % backend, and only CROW can reduce it further.

The genuinely meaningful items are listed below; trivial micro-optimisations are
omitted.

---

## How this was measured

- **API timing** was measured directly against production
  (`https://api.dashboarddeelmobiliteit.nl`) with `curl`, capturing TTFB,
  transfer time, payload size and gateway latency headers.
- **Page load waterfalls** were captured by loading production builds of the
  app (baseline vs. fixed) in headless Chromium (Playwright) and recording every
  API request's start/end time, status, and whether it was aborted. Two profiles
  were tested: a **fresh visitor** (empty `localStorage`) and a **returning
  visitor** (persisted Redux state with a `filter.datum` from an hour ago).
- The headline metric is **"time from the first API request until the vehicles
  payload has fully loaded"**. Absolute wall-clock numbers from the test
  environment are not representative (see caveat below); the **request count**
  and the **delta between baseline and fixed** are the reliable signals.

> **Caveat on absolute numbers.** The test environment reached the API over an
> unusually fast, low-latency path, so a 2.5 MB uncompressed download cost only
> ~1 s there. On a real home or mobile connection that same download takes
> several seconds, so **eliminating a duplicate download saves proportionally
> more for real users than the deltas below suggest.**

---

## Part A — Fixed in this fork (frontend)

All four changes are in commit `2879a31` on branch
`claude/api-query-performance-d4myb4`. Old and new data-processing code were
verified to produce **identical** output (features, geometry, operator stats) on
a real 25 k-vehicle payload and on a synthetic `park_events` payload covering
all duration bins and date formats.

### A1 — Duplicate vehicle downloads (the big one)

**Symptom:** every load of `/map/park` (and `/map/rentals`) fired the ~2.5 MB
vehicles request **2–3 times**. The network trace showed a request being
aborted after ~930 ms of backend work, then restarted from scratch:

```
13696ms → 14694ms  [ABORTED]  /public/vehicles_in_public_space?zone_ids=&timestamp=...
14693ms → 16379ms  [finished] /public/vehicles_in_public_space?...&operators=baqme,bolt,...
```

**Root cause:** any Redux change during app boot re-ran the poller
(`updateParkingData` / `updateVerhuringenData`), which **unconditionally aborted
the in-flight request and started a new one** (`theFetch.abort()` in
`pollParkingData.js` / `pollVerhuringenData.js`). The triggers fire on every
load:

- the public operators list arriving from the `/operators` API (~800 ms in),
  which repopulates `state.metadata.aanbieders`;
- for returning visitors, the "reset `datum` to now" timer (see A2);
- React re-renders propagating fresh `filter` / `metadata` objects.

Because the abort/restart tracking was cleared as soon as the response *headers*
arrived (not when the 2.5 MB body finished downloading), there was also a
~1–2 s window in which a follow-up effect would start a **second** concurrent
download of the same data.

**Fix:**

- Reuse an in-flight request when the new request would hit the exact same URL,
  instead of aborting and re-issuing it.
- Don't restart the fetch when nothing material changed (`shouldFetchVehicles`
  is false) while a request is already in flight.
- Track the in-flight request across the **whole body read**, so a duplicate
  can't slip into the header-to-body gap.
- Process each response against the **store state at completion time** (not at
  request time), so client-side filter changes made mid-flight are still applied
  to the result — this is what makes it safe to *not* restart the request.

**Effect:** exactly **1** vehicles request per load (was 2–3, with 1–2 aborted).
Time-to-vehicles-loaded dropped from a median **2.90 s → 2.49 s** (fresh) in the
test environment; the real-world saving is larger because the eliminated
download(s) are full 2.5 MB transfers. Backend query volume and API egress per
visit are **halved**.

### A2 — Returning visitors re-downloaded everything (stale-datum reset)

**Symptom:** returning visitors paid the double-download cost *and* saw
already-rendered vehicles briefly disappear.

**Root cause:** `App.tsx` reset a stale persisted `filter.datum` to "now" in an
effect that ran **~500 ms after load** — by which point the initial vehicles
fetch was already in flight. Changing `datum` aborted that fetch (via A1) and
re-downloaded the full payload, and the filter-hash change in `AppProvider.js`
dispatched `CLEAR_VEHICLES`, wiping the markers that had just rendered.

**Fix:** perform the stale-`datum` reset **at store bootstrap** in
`AppProvider.js`, before the store is created and before any fetch starts, so
the first fetch already uses the correct timestamp. Shared links (`?view=…`)
keep their persisted `datum`. The old effect remains as a harmless safety net.

**Effect:** removes the second full download for the returning-visitor case
(median **2.91 s → 2.50 s** in-test, larger in the real world).

### A3 — Heavy per-vehicle work on the main thread (`md5` + `moment`)

**Symptom:** processing the vehicles response blocked the main thread longer
than necessary, and re-ran on **every client-side filter toggle** (operator
checkbox, parking-duration filter), making those interactions feel sluggish.

**Root cause:** `processVehiclesResult` / `processRentalsResult` computed, per
vehicle, `md5(latitude + longitude)` for the feature id and constructed a
`moment()` object to diff timestamps. Over ~25 k vehicles that is ~150 ms per
pass, on the main thread.

**Fix:** replace the id with a plain `"lat,lng"` string and the `moment` diff
with `Date.parse` / integer math (with a `moment` fallback for exotic date
formats). Measured **~150 ms → ~15 ms** per pass over 25 k vehicles.

> **Correctness bonus:** the old id hashed the *numeric sum* `latitude +
> longitude`, so two different locations that happen to sum to the same value
> collided into one id. The new `"lat,lng"` id is strictly more unique — on the
> real payload it produced 14 248 distinct ids vs. 13 844 for the old hash.

### A4 — First data poll was needlessly debounced

**Root cause:** the park/rentals effects debounce their poll by 250 ms to
coalesce rapid filter changes — but this delay was also applied to the **very
first** poll, delaying the large vehicles request by 250 ms on every cold load.

**Fix:** fire the first poll immediately; keep the 250 ms debounce for
subsequent filter-driven refetches. Saves ~250 ms off the critical path.

---

## Part B — Backend / infrastructure (asks for CROW)

These are the meaningful wins that the frontend cannot address. They are ordered
by expected impact.

### B1 — Enable gzip/brotli compression on the API (biggest single win)

The vehicles endpoint returns **uncompressed** JSON and ignores the client's
`Accept-Encoding`:

```
$ curl -s -H 'Accept-Encoding: gzip' -o /dev/null -w '%{size_download}\n' \
    https://api.dashboarddeelmobiliteit.nl/dashboard-api/public/vehicles_in_public_space
2512613                       # 2.5 MB, no content-encoding header

gzip of the same body:  ~280 KB   (≈9× smaller)
```

Enabling gzip (or brotli) at the gateway (Kong) or upstream would cut ~2.2 MB
off **every** map load — on typical connections this is the largest available
latency reduction, and it requires no client changes.

### B2 — Reduce query latency on the vehicle/rental endpoints

The gateway reports ~0.9–1.7 s of upstream time per query:

```
x-kong-upstream-latency: 930      # ms of backend time
x-kong-proxy-latency: 6
```

TTFB measured **1.4–1.9 s** across repeated calls. This is the floor the
frontend fixes cannot get under. Worth a database-side look (indexes / query
plan / materialised current-state table) on `park_events` and
`vehicles_in_public_space`.

### B3 — Honour geographic filters on the public vehicles endpoint

`/public/vehicles_in_public_space` returns **all ~25 k vehicles NL-wide**
regardless of `gm_code` / `zone_ids`:

```
?gm_code=GM0518  (Den Haag)   → 25 033 vehicles
?gm_code=GM0599  (Rotterdam)  → 25 029 vehicles
(no filter)                   → 25 017 vehicles
```

A city-scoped view only needs that city's vehicles. Server-side filtering (or
trimming unused response fields) would shrink the payload dramatically for the
common single-municipality case — compounding with B1.

### B4 — Render-blocking third-party CSS in `index.html`

Not backend, but it blocks *perceived* load and is worth flagging: the app's
HTML pulls **render-blocking** stylesheets from third-party CDNs
(`unpkg.com/maplibre-gl@…/maplibre-gl.css` and Google Fonts). If either CDN is
slow or unreachable, the **entire app is blocked** from rendering until those
requests time out. Self-hosting these assets removes an external point of
failure from the critical path. (A menu image is similarly hotlinked from
`i.imgur.com`.)

---

## Summary of asks to CROW

| # | Owner | Ask | Impact |
|---|---|---|---|
| B1 | dashboard-api / gateway | **Enable gzip/brotli** on API responses | ~2.5 MB → ~280 KB per load; largest single win |
| B2 | dashboard-api | Reduce ~1 s query latency on vehicle/rental endpoints | Lowers the floor the frontend can't get under |
| B3 | dashboard-api | Honour `gm_code` / `zone_ids` on `/public/vehicles_in_public_space` | Much smaller payload for city-scoped views |
| B4 | frontend build/hosting | Self-host maplibre CSS + fonts (stop render-blocking on external CDNs) | Removes external failure point from first paint |

The frontend duplicate-download and processing fixes (A1–A4) are already
implemented in this fork (commit `2879a31`) and are self-contained enough to
apply upstream.
