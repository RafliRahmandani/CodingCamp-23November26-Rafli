# Implementation Plan: Todo List Life Dashboard

## Overview

The Dashboard is a self-contained client-side web app: one `index.html`, exactly one CSS file in `css/dashboard.css`, and exactly one Vanilla JavaScript file in `js/dashboard.js`, with no build step and no runtime external resources (no CDN, no Chart.js). All data persists in Browser Local Storage. The single `js/dashboard.js` is organized into logical sections — Validation, Domain Logic, Renderers, Persistence, and Controller — so the pure functions can be unit- and property-tested in isolation. Each mutation (add/delete) updates a central in-memory `transactions[]` array (the single source of truth), persists it, and triggers a full re-render of the three view components. The same static bundle runs as a local `file://` page, on GitHub Pages, and as a Manifest V3 browser extension popup.

The test harness (Vitest in `--run` mode, `fast-check`, jsdom) is dev-only tooling and is not part of the deployed static bundle; pure functions in `dashboard.js` are exposed for testing via a guard pattern that works in both browser and test contexts.

## Tasks

- [x] 1. Scaffold project structure, HTML skeleton, and test harness
  - Create `index.html` with the four components in order: shop-style header banner, `#total-balance-display` at the top, `#transaction-form` (containing `#item-name-input` with `maxlength="100"`, `#amount-input` with `inputmode="decimal"`, `#category-select` offering exactly Food/Transport/Fun, `#submit-button`, and `#form-validation-message`), `#transaction-list` scrollable container, and `#visual-chart` container
  - Link `css/dashboard.css` and load `js/dashboard.js` with `defer`; use only relative asset paths so the bundle works under `file://`, a GitHub Pages subpath, and the extension popup
  - Create empty `css/dashboard.css` and `js/dashboard.js`, each with section comment headers (Validation, Domain Logic, Renderers, Persistence, Controller) and uniform 2-space indentation
  - Create `manifest.json` (Manifest V3) at repo root with `action.default_popup` set to `index.html` (inert when opened as a web page)
  - Create dev-only test harness files (`package.json`, Vitest config with `--run`, jsdom setup) so pure functions can be imported/tested; these files are not deployed with the app
  - _Requirements: 1.1, 1.2, 3.1, 6.3, 7.3, 10.1, 10.2, 10.3, 10.4_

- [x] 2. Apply the online-shop theme in CSS
  - Style the header/banner, total balance, input form (add-to-cart panel), transaction list (cart rows with price-tag amounts and category badges), and chart card with an e-commerce storefront aesthetic
  - Define CSS variables: body text `16px`, transaction-entry `16px`, total-balance `36px` (a `2.25×` ratio); apply one system-font-family stack to every text element
  - Style the empty-state placeholders for the transaction list ("No transactions yet") and the chart ("No spending data is available"); style non-blocking status banners for persistence, load, and delete errors
  - Apply one accent color, rounded corners, subtle shadows, and uniform spacing across all four components
  - _Requirements: 2.5, 4.4, 9.1, 9.2, 9.3, 9.4_

- [x] 3. Implement validation and the Transaction data model (pure functions)
  - [x] 3.1 Implement `validateTransactionInput(itemName, amountString, category)` returning `{ valid: boolean, errors: string[] }`
    - Reject trimmed item name with fewer than one non-whitespace character, or raw length over 100 characters
    - Reject amount that is non-finite, non-positive, has more than two decimal places (string-based decimal-place check), or exceeds `999999999.99`; accept the boundaries `0.01` and `999999999.99`
    - Reject category not in Food, Transport, Fun
    - Expose the function for testing via a browser/test guard
    - _Requirements: 1.1, 1.3, 1.4, 1.5_

- [x] 4. Implement the Local Storage Manager
  - [x] 4.1 Implement `serializeTransactions(transactions)` (JSON.stringify), `deserializeTransactions(jsonString)` (JSON.parse plus per-item structural validation returning `{ ok, data, error }`), `saveTransactions(transactions)` (write under the storage key; return `false` and retain the in-memory set on throw/deny), and `loadTransactions()` (absent key → empty set; parse failure → empty set plus a load-error signal; otherwise the parsed set)
    - Use the storage key `todoListLifeDashboard:transactions`
    - Expose the functions for testing via a browser/test guard
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

- [x] 5. Implement Total Balance Display logic
  - [x] 5.1 Implement `computeTotalBalance(transactions)` (pure: epsilon-rounded sum to two decimals, `0` for an empty set) and `renderTotalBalance(transactions)` (format to two decimals into `#total-balance-display`, positioned above the list/chart)
    - Expose `computeTotalBalance` for testing via a browser/test guard
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 6. Implement the SVG pie chart
  - [x] 6.1 Implement `aggregateByCategory(transactions)` (sum per category, `0` for absent), `computeSegmentAngles(categoryTotals, grandTotal)` (one segment per category with total greater than zero; `fraction = total / grandTotal`; angles sum to 360°), `describeArc(centerX, centerY, radius, startAngle, endAngle)` (SVG path `d` for a wedge), and `renderChart(transactions)` (build one labeled, uniquely-colored `<path>` per present category with a fixed color constant per category; render the empty-state message and no segments when there are no transactions or `grandTotal === 0`)
    - Expose the pure functions (`aggregateByCategory`, `computeSegmentAngles`) for testing via a browser/test guard
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 7. Implement Transaction List rendering and delete
  - [x] 7.1 Implement `renderTransactionList(transactions)` (one row per transaction showing item name, amount, and category; a delete control tagged with `data-transaction-id`; empty-state indication when none) and `handleDeleteTransaction(id)` (remove the matching transaction then persist and re-render; if no transaction matches, retain the entry and show a delete-failure indication)
    - Expose `renderTransactionList` for testing via a browser/test guard (DOM-dependent, tested under jsdom)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [x] 8. Implement Input Form handler, controller, and wiring
  - [x] 8.1 Implement `handleFormSubmit(event)` (validate → create a Transaction with a `crypto.randomUUID()` id, or a timestamp-plus-random fallback → push to the in-memory state → persist → `renderAll()` → clear all input fields; on invalid input, show inline validation messages and do not mutate state), `initDashboard()` (on `DOMContentLoaded`: `loadTransactions()` → populate state → `renderAll()` → attach form-submit and list-delete listeners), `renderAll()` (invoke the list, balance, and chart renderers), and error-display helpers (`showFormValidation`, `clearFormValidation`, `showPersistenceError`, `showLoadError`, `showDeleteFailure`)
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 2.3, 2.4, 3.3, 3.4, 4.3, 5.1, 5.2, 5.7, 5.8, 7.1_

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test tasks and can be skipped for a faster MVP; core implementation tasks (3.1, 4.1, 5.1, 6.1, 7.1, 8.1) are never optional.
- Each task references specific requirement clauses (e.g., 1.3, 5.5) for traceability between implementation and spec.
- Checkpoints (tasks 9 and 12) provide incremental validation; stop and ask the user if questions arise.
- Property tests validate universal correctness properties across many generated inputs (minimum 100 iterations each); unit tests cover specific examples and edge cases. The two are complementary.
- The deployed bundle is plain static HTML/CSS/JS with no build step and no external runtime resources. The test harness (Vitest, fast-check, jsdom) is dev-only tooling listed in `package.json` and is not shipped with the app; it satisfies the "no build step at runtime" requirement because it never touches the deployed files.
- Pure functions in `js/dashboard.js` are exposed for testing via a guard pattern (e.g., a global namespace plus a conditional export) that works in both browser and test contexts, so tests import them without loading the full page; DOM-dependent renderers are tested under jsdom.
- Indentation is uniform within each file (2 spaces), and all identifiers use complete meaningful words with no single-letter names, generic placeholders, or numeric suffixes.
- GitHub Pages publication (commit + push via GitHub Desktop to the Pages source branch) is a manual Git operation performed by the user; the code is structured with relative paths and a self-contained static bundle so it is deployable as-is. The actual deployment is outside the coding-agent scope, and requirement clauses 11.1–11.3 are satisfied by that manual publish step rather than by code.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2", "3.1"] },
    { "id": 2, "tasks": ["3.2", "4.1"] },
    { "id": 3, "tasks": ["4.2", "5.1"] },
    { "id": 4, "tasks": ["5.2", "6.1"] },
    { "id": 5, "tasks": ["6.2", "7.1"] },
    { "id": 6, "tasks": ["7.2", "8.1"] },
    { "id": 7, "tasks": ["8.2"] },
    { "id": 8, "tasks": ["9"] },
    { "id": 9, "tasks": ["10.1", "10.2", "10.3"] },
    { "id": 10, "tasks": ["11.1", "11.2"] },
    { "id": 11, "tasks": ["12"] }
  ]
}
```
