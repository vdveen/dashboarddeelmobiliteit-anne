# Recommended fixes for the stichting-crow source repository

## Scope

This note describes three findings in `stichting-crow/main` at commit
`035a7d5d48e7491a8b8083e42dd9f23233ff23ff` from 19 August 2026. It explains
the problem, the affected code, and a repository-wide fix for each finding.

The first finding is a potential vulnerability. It is not a claim that an
exploit has been demonstrated. Exploitability depends on whether the affected
API and GeoJSON fields can contain attacker-controlled or unsanitized data.

## Summary and suggested priority

| Priority | Finding | Main effect |
| --- | --- | --- |
| 1 | Map popup values are inserted as HTML | Potential DOM or stored cross-site scripting (XSS) |
| 2 | The application installs the npm CLI and runs an unpinned install hook | Known vulnerable dependencies and a less reproducible install process |
| 3 | Operator detection lets a fallback override a known organisation type | Municipality users can lose the HB layer and hub-editing controls |

The popup audit should start first because it crosses a browser security
boundary. The dependency cleanup can follow independently. The operator fix is
small and low risk, so it is also suitable for an early maintenance release.

## 1. Map popup values are inserted as HTML

### Problem

MapLibre's `Popup.setHTML()` parses its argument as HTML. Several popup builders
interpolate values from APIs or map features into template strings before they
call `setHTML()`. If one of those values contains markup, the browser can create
elements or event handlers from that value.

For example, a value such as the following must appear as text, not as an image
element:

```text
<img src=x onerror=alert(1)>
```

Escaping selected fields is easy to miss because the larger HTML string contains
many different contexts. Text, URL attributes, data attributes, and CSS values
do not all have the same validation rules. Building DOM nodes is safer than
maintaining ad hoc escaping in each popup.

### Affected code

The repository currently has the following popup HTML sinks and related
builders.

| File and line | Data used | Recommended action |
| --- | --- | --- |
| `src/components/SearchBar/SearchBar.tsx:243` | Policy hub name from application data | Replace `setHTML()` with `setText(hub.name)` or use a DOM node whose `textContent` is the hub name. |
| `src/components/SearchBar/SearchBar.tsx:284` | Address label returned by PDOK | Replace `setHTML()` with `setText(label || 'Locatie')`. |
| `src/components/Map/MapUtils/map.hb.ts:393` | A calculated count and percentage | Use `setText(description)`. The current value is numeric, but HTML parsing is unnecessary. |
| `src/components/Map/MapUtils/popups.js:213` and `:259` | Vehicle, provider, type, date, distance, URL, and color values | Replace the string builders with DOM builders and pass the result to `setDOMContent()`. |
| `src/components/Map/MapUtils/zones.js:275` | Zone name, status, capacity, modality, and icon values | Replace `generatePopupHtml()` with a DOM builder and use `setDOMContent()`. |
| `src/components/Map/MapUtils/map.policy_hubs.popups.ts:23`, `:47`, `:82`, `:200`, `:239`, and `:278` | Policy hub name and phase | The function already passes a DOM node to MapLibre, but first assigns interpolated strings to that node's `innerHTML`. Build the node's children with DOM APIs instead. No import of this module was found at the reviewed revision. Remove the module if it is obsolete, or fix it before it is reactivated. |
| `src/components/MapLayer/DdPolicyHubsLayer.tsx:824` | Overlapping policy hub properties | The current builder calls `escapeHtml()` for its dynamic hub values. Keep that protection and add tests, or migrate it to the same DOM-building API. |
| `src/components/Features/demo/DemoHubsMap.tsx:93` | Local demo feature data | Lower risk because the data is currently static. Migrate it so later changes cannot turn it into a live-data sink. |
| `src/components/Features/demo/DemoRentalOriginsMap.tsx:63` | Local demo feature data | Lower risk because the data is currently static. Migrate it so later changes cannot turn it into a live-data sink. |
| `src/components/Features/demo/DemoVehiclesMap.tsx:88` | Local demo feature data | Lower risk because the data is currently static. Migrate it so later changes cannot turn it into a live-data sink. |

`src/components/PrestatiesAanbieders/ProviderLabel.tsx:19` is also part of the
live popup path. `buildProviderLabelHtml()` inserts `label` and `color` into an
HTML snippet. It is called by both popup paths in `popups.js`. Its React
component is not affected because React escapes text values and assigns style
properties through the DOM.

### Recommended fix

Use MapLibre's text and DOM APIs according to the content required:

1. Use `setText()` for a popup that only displays text.
2. For a rich popup, create elements with `document.createElement()`.
3. Assign API and feature values with `textContent`.
4. Assign styles through element `style` properties after validating values.
5. Parse links with `new URL()`, allow only the required protocols, and assign
   the accepted URL to the `href` property.
6. Register click behavior with `addEventListener()`. Do not generate inline
   event-handler attributes.
7. Pass the completed root element to `Popup.setDOMContent()`.

A simple text popup can use this pattern:

```ts
const popupBody = document.createElement('div');
popupBody.textContent = label || 'Locatie';

const popup = new maplibregl.Popup({ offset: 25 })
  .setDOMContent(popupBody);
```

For `popups.js`, replace `buildProviderLabelHtml()`,
`buildVehicleBodyHtml()`, and `buildOverlappingVehiclesTableHtml()` with
functions that return DOM elements. Do the same for `generatePopupHtml()` and
its row helpers in `zones.js`. In `map.policy_hubs.popups.ts`, assigning a string
to `element.innerHTML` has the same parsing risk as `Popup.setHTML()`. Replace
those assignments too. This removes the need to remember which values need HTML
escaping.

If the team must accept rich HTML strings from an external source, sanitize the
complete string with an agreed and maintained sanitizer immediately before the
sink. A sanitizer is not needed for these popups if the code builds the required
markup itself.

### Acceptance checks

- Every live-data popup renders `<img src=x onerror=alert(1)>` as visible text.
- Test text-node handling for hub names, provider names, vehicle IDs, and zone
  names.
- Test attribute handling for provider website URLs, colors, modality names,
  and icon URLs.
- Unsafe URL schemes such as `javascript:` are rejected.
- The overlapping-vehicle and overlapping-hub click handlers still select the
  correct row.
- `git grep -n -E '\.setHTML\(|\.innerHTML[[:space:]]*=' -- src/components`
  returns no unaudited live-data popup sink. Any remaining call has a test and a
  comment that documents why its complete input is safe.

## 2. The dependency and install process adds avoidable risk

### Problem

`package.json` currently contains:

```json
"dependencies": {
  "i": "^0.3.7",
  "npm": "^8.4.0"
},
"resolutions": {
  "react-error-overlay": "6.1.0"
},
"scripts": {
  "preinstall": "npx npm-force-resolutions"
}
```

No application source imports either `npm` or `i`. The npm CLI is an
application with a large dependency tree, not a normal browser runtime library.
Declaring it as a production dependency installs that tree with the frontend
application even though the application does not use it.

The lockfile resolves `npm` to `8.19.4`. Its bundled dependencies include
`tar@6.1.11`. An `npm audit --omit=dev` snapshot on 24 August 2026 reported 58
production findings: 1 critical, 40 high, 7 moderate, and 10 low. The critical
path was through this npm dependency and its bundled `tar` version. Advisory
results can change, but the unused dependency remains unnecessary even if the
counts later change.

The install hook creates a separate supply-chain and reproducibility problem.
`npx npm-force-resolutions` can download and execute a package that is not
pinned in this repository. It then mutates `package-lock.json` during install to
apply a Yarn-oriented `resolutions` field. A clean install should consume a
reviewed lockfile, not rewrite it before dependency resolution.

### Recommended fix

1. Confirm with the maintainers that no release script outside this repository
   depends on the `npm` or `i` package entries.
2. Remove `npm` and `i` from `dependencies`.
3. Remove the `preinstall` script and the `resolutions` field.
4. Pin the direct development dependency to the required version:

   ```json
   "devDependencies": {
     "react-error-overlay": "6.1.0"
   }
   ```

5. If the version must also be forced for all transitive occurrences, use npm's
   built-in override support instead of an install-time lockfile mutation:

   ```json
   "overrides": {
     "react-error-overlay": "$react-error-overlay"
   }
   ```

6. Regenerate `package-lock.json` once with the Node and npm versions chosen for
   the repository. Review and commit the resulting lockfile.

The repository currently declares Node `24.18.0` in `package.json`, while
`.github/workflows/pages.yml` installs Node `18.18.2`. The maintainers should
choose one supported toolchain before regenerating the lockfile so local and CI
installs produce the same result.

Do not use `npm audit fix --force` as a substitute for reviewing the dependency
changes. It can introduce unrelated major-version upgrades.

### Acceptance checks

Run the following with the selected toolchain:

```sh
npm ci
npm audit --omit=dev
npm test -- --watchAll=false
npm run build
```

Then verify:

- `npm ci` does not download an undeclared `npm-force-resolutions` tool or
  modify `package-lock.json`.
- `npm ls npm i` does not show either package as a direct application
  dependency.
- `npm ls react-error-overlay` shows the intended version.
- The npm CLI to `tar@6.1.11` audit path is gone.
- The audit report and lockfile contain no unexplained new dependency paths.

## 3. Operator detection overrides known organisation types

### Problem

`src/components/SelectLayer/SelectLayerModal.tsx:41` currently calculates:

```ts
const isOperatorUser = isLoggedIn && (
  isOperatorAccount(acl) || isOperatorPrestatiesView(aclOperators)
);
```

`isOperatorPrestatiesView()` is a useful fallback for legacy ACL data. It returns
`true` when only one operator is in scope. That fact alone does not prove that
the logged-in organisation is an operator. A municipality can also have only
one provider in scope.

The same precedence issue exists inside
`src/helpers/authentication.js:isOperatorAccount()`. It checks for an `OPERATOR`
organisation, but it then applies its single-operator fallback even when the ACL
contains a known non-operator type such as `MUNICIPALITY` or
`OTHER_GOVERNMENT`.

The result is primarily a denial of application functionality:

- `DataLayerList` hides the "Verhuringen als HB matrix" option from a
  municipality with one provider.
- `canEditHubs()` calls `isOperatorAccount()`. A false operator classification
  can therefore hide or disable hub-editing controls throughout the policy hub
  components, even when the municipality has `MICROHUB_EDIT`.

This finding does not show a permission elevation. The observed incorrect path
removes features. Backend authorization must remain authoritative in every
case.

### Correct classification rule

A known organisation type is authoritative. Use the single-operator heuristic
only when the organisation type is absent.

| ACL state | Correct operator result |
| --- | ---: |
| `OPERATOR` organisation | `true` |
| `MUNICIPALITY` with one operator | `false` |
| `MUNICIPALITY` with several operators | `false` |
| `OTHER_GOVERNMENT` with one operator | `false` |
| Missing organisation type with one valid operator | `true` |
| Missing organisation type with zero or several operators | `false` |

### Recommended fix

Make `isOperatorAccount()` stop as soon as it finds a known organisation type:

```js
export const isOperatorAccount = (acl) => {
  if (!acl) return false;

  const organisationType = getAclOrganisationType(acl);
  if (organisationType) {
    return organisationType === 'OPERATOR';
  }

  const operators = acl.operators;
  return Boolean(
    Array.isArray(operators)
    && operators.length === 1
    && operators[0]?.system_id
    && !acl.is_admin
  );
};
```

Add one helper for UI decisions that also need the separately loaded
`aclOperators` fallback:

```js
import { isOperatorPrestatiesView } from './prestatiesAanbiedersViewMode';

export const isOperatorUser = (acl, aclOperators = []) => {
  const organisationType = getAclOrganisationType(acl);
  if (organisationType) {
    return organisationType === 'OPERATOR';
  }

  return isOperatorAccount(acl)
    || isOperatorPrestatiesView(aclOperators);
};
```

Then change `SelectLayerModal.tsx` to use the central rule:

```ts
import { isOperatorUser as checkIsOperatorUser } from '../../helpers/authentication';

const isOperatorUser =
  isLoggedIn && checkIsOperatorUser(acl, aclOperators);
```

Remove the direct `isOperatorAccount` and `isOperatorPrestatiesView` imports from
that component.

Search for other places that combine account type with the number of operators.
Use the new helper only when the question is "should this user get an
operator-restricted UI?" Do not replace valid calls that intentionally answer a
different question. In particular, the performance-page view-mode helpers in
`prestatiesAanbiedersViewMode.ts` and the popup-title decision in
`MapComponent.tsx` use the operator scope of that feature and should be reviewed
in their own context, not changed mechanically.

Fixing the shared `isOperatorAccount()` implementation also corrects all current
`canEditHubs()` consumers without editing each component.

### Acceptance checks

Add unit tests for the classification table above and include these integration
checks:

- An operator organisation cannot select the HB matrix.
- A municipality with one provider can select the HB matrix.
- A municipality with `MICROHUB_EDIT` retains its hub-editing controls when one
  operator is in scope.
- An operator remains unable to edit hubs, even if its ACL happens to include
  `MICROHUB_EDIT`.
- A legacy ACL without an organisation type still uses the single-operator
  fallback.

## Suggested delivery

These findings can be delivered as three focused pull requests so each change
has a clear review and rollback boundary:

1. Replace live popup HTML interpolation and add malicious-input regression
   tests.
2. Remove the unused dependencies and mutable install hook, then regenerate and
   audit the lockfile.
3. Centralize operator classification and add account-matrix tests.

The popup work can be split into live popups and demo popups if the first change
becomes too large. The live popup paths should remain the first security
boundary.
