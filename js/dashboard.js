/*
 * dashboard.js - Todo List Life Dashboard application logic.
 *
 * Single-file Vanilla JavaScript. No build step, no external runtime resources.
 * Organized into logical sections below; pure functions are exposed for testing
 * via a browser/test guard added in later tasks.
 */

// === Validation ===

/**
 * Validates the input for a new transaction.
 *
 * Pure function: no side effects, no DOM access, no localStorage. Returns an
 * object describing whether the input is valid and, if not, a list of
 * human-readable error messages that identify the offending field(s).
 *
 * Rules (Requirements 1.1, 1.3, 1.4, 1.5):
 *   - itemName is invalid if its trimmed value has fewer than one
 *     non-whitespace character, or if its raw (untrimmed) length exceeds 100.
 *   - amountString is invalid if it is non-numeric, non-positive, has more than
 *     two decimal places, or exceeds 999999999.99. Decimal places are counted
 *     from the string (not the parsed number) to avoid floating-point
 *     misclassification of values such as 0.1 + 0.2.
 *   - category is invalid if it is not one of Food, Transport, or Fun.
 *
 * @param {string} itemName - Raw item name text (may have leading/trailing whitespace).
 * @param {string} amountString - Raw amount text (a string such as "12.50").
 * @param {string} category - Selected category (Food, Transport, or Fun).
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateTransactionInput(itemName, amountString, category) {
  const errors = [];

  // --- Item name ---
  // Defensively coerce non-strings to an empty string so the checks below
  // never throw and treat missing input as an empty (invalid) item name.
  const itemNameText = typeof itemName === 'string' ? itemName : '';
  const trimmedItemName = itemNameText.trim();
  if (trimmedItemName.length < 1) {
    errors.push('Item name must contain at least one non-whitespace character.');
  }
  if (itemNameText.length > 100) {
    errors.push('Item name must be 100 characters or fewer.');
  }

  // --- Amount ---
  const amountText = typeof amountString === 'string' ? amountString : '';
  const trimmedAmount = amountText.trim();
  // Valid decimal format: an optional sign, one or more digits, and an optional
  // single fractional part of one or more digits. Scientific notation, hex,
  // empty input, and other non-decimal forms are rejected here as non-numeric.
  const decimalFormat = /^[+-]?\d+(\.\d+)?$/;
  if (trimmedAmount === '' || !decimalFormat.test(trimmedAmount)) {
    errors.push('Amount must be a positive number with at most two decimal places, between 0.01 and 999999999.99.');
  } else {
    // Count decimal places from the string (not the parsed number) so that
    // floating-point representation cannot misclassify a value.
    const decimalPointIndex = trimmedAmount.indexOf('.');
    if (decimalPointIndex !== -1 && (trimmedAmount.length - decimalPointIndex - 1) > 2) {
      errors.push('Amount must have at most two decimal places.');
    } else {
      const numericAmount = Number(trimmedAmount);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        errors.push('Amount must be a positive number greater than zero.');
      } else {
        const maximumAmount = 999999999.99;
        // A tiny epsilon absorbs floating-point representation noise so the
        // boundary 999999999.99 itself is accepted while anything strictly
        // greater is rejected.
        const epsilon = 1e-9;
        if (numericAmount > maximumAmount + epsilon) {
          errors.push('Amount must not exceed 999999999.99.');
        }
      }
    }
  }

  // --- Category ---
  const validCategories = ['Food', 'Transport', 'Fun'];
  if (!validCategories.includes(category)) {
    errors.push('Category must be one of Food, Transport, or Fun.');
  }

  return { valid: errors.length === 0, errors };
}

// === Domain Logic ===

/**
 * Computes the total balance of a set of transactions.
 *
 * Pure function: no DOM access, no side effects, no localStorage.
 * Sums all `amount` values and applies epsilon-rounding to exactly two decimal
 * places, preventing floating-point drift on values such as 0.1 + 0.2
 * (Requirement 3.2, Design Property 7).
 *
 * @param {Array<{id: string, itemName: string, amount: number, category: string}>} transactions
 *   Array of transaction objects. Each `amount` is assumed to be a finite positive
 *   number already validated on entry; no re-validation is performed here.
 * @returns {number} The two-decimal-place rounded sum of all amounts, or `0` for
 *   an empty array or when all amounts sum to zero.
 */
function computeTotalBalance(transactions) {
  const rawSum = transactions.reduce(function (accumulator, transaction) {
    return accumulator + transaction.amount;
  }, 0);
  return Math.round(rawSum * 100 + Number.EPSILON) / 100;
}

// === Domain Logic (Chart) ===

/**
 * Fixed color constants for each category.
 * These values MUST match the CSS `.category-badge--food/transport/fun` rules
 * exactly so the chart segments and list badges share the same palette.
 */
const CATEGORY_COLORS = {
  Food: '#ea580c',
  Transport: '#059669',
  Fun: '#db2777',
};

/**
 * Aggregates transaction amounts by category, returning a fixed-shape object.
 *
 * Pure function: no side effects, no DOM access, no localStorage.
 * Each property value is the epsilon-rounded two-decimal sum of `amount` for
 * all transactions whose `category` matches that key (Requirement 4.1).
 * Categories with no matching transactions are `0`.
 *
 * @param {Array<{id: string, itemName: string, amount: number, category: string}>} transactions
 * @returns {{ Food: number, Transport: number, Fun: number }}
 */
function aggregateByCategory(transactions) {
  const totals = { Food: 0, Transport: 0, Fun: 0 };
  transactions.forEach(function (transaction) {
    if (Object.prototype.hasOwnProperty.call(totals, transaction.category)) {
      totals[transaction.category] += transaction.amount;
    }
  });
  // Apply epsilon rounding to each sum (same technique as computeTotalBalance).
  Object.keys(totals).forEach(function (category) {
    totals[category] = Math.round(totals[category] * 100 + Number.EPSILON) / 100;
  });
  return totals;
}

/**
 * Computes the pie-chart segment angles from per-category totals.
 *
 * Pure function: no side effects, no DOM access, no localStorage.
 * Returns one segment object per category whose total is greater than zero.
 * The last segment's `endAngle` is forced to close the circle exactly at
 * `startAngle + (360 - accumulated)` to absorb floating-point gaps
 * (Design Property 8, Requirement 4.1).
 *
 * @param {{ Food: number, Transport: number, Fun: number }} categoryTotals
 *   The output of `aggregateByCategory`.
 * @param {number} grandTotal
 *   The combined sum of all category totals (must be > 0).
 * @returns {Array<{ category: string, startAngle: number, endAngle: number, color: string }>}
 */
function computeSegmentAngles(categoryTotals, grandTotal) {
  const segments = [];
  let accumulatedDegrees = 0;

  // Iterate in a stable order so the chart layout is deterministic.
  const categoryOrder = ['Food', 'Transport', 'Fun'];
  categoryOrder.forEach(function (category) {
    const categoryTotal = categoryTotals[category];
    if (categoryTotal <= 0) {
      return; // skip absent categories
    }

    const fraction = categoryTotal / grandTotal;
    const angleDegrees = fraction * 360;
    const startAngle = accumulatedDegrees;
    const endAngle = startAngle + angleDegrees;

    segments.push({
      category: category,
      startAngle: startAngle,
      endAngle: endAngle,
      color: CATEGORY_COLORS[category],
    });

    accumulatedDegrees = endAngle;
  });

  // Force the last segment's endAngle to close the full circle exactly, so the
  // sum of (endAngle - startAngle) across all segments is always exactly 360°
  // rather than 359.99...8 or 360.00...2 due to floating-point drift.
  if (segments.length > 0) {
    const lastSegment = segments[segments.length - 1];
    const spannedByOtherSegments = lastSegment.startAngle - segments[0].startAngle;
    const remainingDegrees = 360 - spannedByOtherSegments;
    lastSegment.endAngle = lastSegment.startAngle + remainingDegrees;
  }

  return segments;
}

/**
 * Builds the SVG `d` attribute string for a pie-wedge arc path.
 *
 * Pure function: no side effects, no DOM access.
 * Angles are measured clockwise from the top (12 o'clock), so they are
 * rotated by -90° before conversion to radians to align with standard SVG
 * coordinates (Requirement 4.1).
 *
 * When `endAngle - startAngle >= 360` a full circle is drawn as two semi-arcs
 * to work around the SVG constraint that a single arc cannot span 360°.
 * Otherwise the path is: M cx cy  L x1 y1  A r r 0 largeArcFlag 1 x2 y2  Z
 *
 * @param {number} centerX - X coordinate of the circle's center.
 * @param {number} centerY - Y coordinate of the circle's center.
 * @param {number} radius  - Radius of the circle.
 * @param {number} startAngle - Start angle in degrees (clockwise from 12 o'clock).
 * @param {number} endAngle   - End angle in degrees (clockwise from 12 o'clock).
 * @returns {string} An SVG path `d` attribute value.
 */
function describeArc(centerX, centerY, radius, startAngle, endAngle) {
  // Convert from clockwise-from-top to standard math angles (counter-clockwise
  // from the right), achieved by subtracting 90° before the radians conversion.
  const startRadians = (startAngle - 90) * (Math.PI / 180);
  const endRadians = (endAngle - 90) * (Math.PI / 180);

  const startX = centerX + radius * Math.cos(startRadians);
  const startY = centerY + radius * Math.sin(startRadians);

  // Full circle: draw two semi-arcs because a single SVG arc cannot span 360°.
  if (endAngle - startAngle >= 360) {
    const oppositeRadians = startRadians + Math.PI;
    const midX = centerX + radius * Math.cos(oppositeRadians);
    const midY = centerY + radius * Math.sin(oppositeRadians);
    return (
      'M ' + centerX + ' ' + centerY +
      ' L ' + startX.toFixed(4) + ' ' + startY.toFixed(4) +
      ' A ' + radius + ' ' + radius + ' 0 1 1 ' + midX.toFixed(4) + ' ' + midY.toFixed(4) +
      ' A ' + radius + ' ' + radius + ' 0 1 1 ' + startX.toFixed(4) + ' ' + startY.toFixed(4) +
      ' Z'
    );
  }

  const endX = centerX + radius * Math.cos(endRadians);
  const endY = centerY + radius * Math.sin(endRadians);
  const largeArcFlag = (endAngle - startAngle) > 180 ? 1 : 0;

  return (
    'M ' + centerX + ' ' + centerY +
    ' L ' + startX.toFixed(4) + ' ' + startY.toFixed(4) +
    ' A ' + radius + ' ' + radius + ' 0 ' + largeArcFlag + ' 1 ' + endX.toFixed(4) + ' ' + endY.toFixed(4) +
    ' Z'
  );
}

// === Renderers ===

/**
 * Renders the Transaction List into the `#transaction-list` DOM container.
 *
 * Clears the container on each call and rebuilds it from the provided array.
 * When `transactions` is empty, inserts an empty-state paragraph and returns.
 * Otherwise inserts one `.transaction-row` div per transaction (Requirements
 * 2.1, 2.2, 2.4, 2.5).
 *
 * Each row contains:
 *   - `.transaction-item-name` span — the item name text.
 *   - `.transaction-amount` span   — the amount formatted as $X.XX.
 *   - `.transaction-category` span — a nested `.category-badge` span with the
 *     category modifier class (e.g. `category-badge--food`).
 *   - `.delete-button` button      — `data-transaction-id` and `aria-label`.
 *
 * Silently skips if `#transaction-list` is absent (defensive guard).
 *
 * @param {Array<{id: string, itemName: string, amount: number, category: string}>} transactions
 */
function renderTransactionList(transactions) {
  var listContainer = document.getElementById('transaction-list');
  if (!listContainer) {
    return;
  }

  // Clear any previous content.
  listContainer.innerHTML = '';

  if (transactions.length === 0) {
    var emptyParagraph = document.createElement('p');
    emptyParagraph.className = 'empty-state';
    emptyParagraph.textContent = 'No transactions yet';
    listContainer.appendChild(emptyParagraph);
    return;
  }

  transactions.forEach(function (transaction) {
    // --- Row container ---
    var rowDiv = document.createElement('div');
    rowDiv.className = 'transaction-row';

    // --- Item name ---
    var nameSpan = document.createElement('span');
    nameSpan.className = 'transaction-item-name';
    nameSpan.textContent = transaction.itemName;

    // --- Amount formatted as $X.XX ---
    var amountSpan = document.createElement('span');
    amountSpan.className = 'transaction-amount';
    amountSpan.textContent = '$' + transaction.amount.toFixed(2);

    // --- Category badge ---
    // The modifier class uses the lowercase category name (e.g. "Food" → "food").
    var categoryModifier = transaction.category.toLowerCase();
    var badgeSpan = document.createElement('span');
    badgeSpan.className = 'category-badge category-badge--' + categoryModifier;
    // Capitalize the first letter of the displayed label (e.g. "Food").
    badgeSpan.textContent = transaction.category.charAt(0).toUpperCase() + transaction.category.slice(1);

    var categorySpan = document.createElement('span');
    categorySpan.className = 'transaction-category';
    categorySpan.appendChild(badgeSpan);

    // --- Delete button ---
    var deleteButton = document.createElement('button');
    deleteButton.className = 'delete-button';
    deleteButton.setAttribute('data-transaction-id', transaction.id);
    deleteButton.setAttribute('aria-label', 'Delete ' + transaction.itemName);
    deleteButton.textContent = 'Delete';

    // --- Assemble row ---
    rowDiv.appendChild(nameSpan);
    rowDiv.appendChild(amountSpan);
    rowDiv.appendChild(categorySpan);
    rowDiv.appendChild(deleteButton);

    listContainer.appendChild(rowDiv);
  });
}

/**
 * Renders the Total Balance Display into the DOM.
 *
 * Calls `computeTotalBalance`, formats the result to exactly two decimal places,
 * and writes a human-readable label into `#total-balance-display`.
 *
 * Display format: "Total Balance: $<amount>" — for example, "Total Balance: $12.50".
 *
 * Silently skips if the target element is absent (defensive guard), so this
 * function is safe to call in test environments that do not construct the full
 * page DOM (Requirements 3.3, 3.4, 3.6).
 *
 * @param {Array<{id: string, itemName: string, amount: number, category: string}>} transactions
 */
function renderTotalBalance(transactions) {
  const displayElement = document.getElementById('total-balance-display');
  if (!displayElement) {
    return;
  }
  const totalAmount = computeTotalBalance(transactions);
  displayElement.textContent = 'Total Balance: $' + totalAmount.toFixed(2);
}

/**
 * Renders the Visual Chart into the `#visual-chart` DOM container.
 *
 * When `transactions` is empty or the grand total is zero, writes an empty-state
 * paragraph and returns. Otherwise builds an inline SVG (200×200) containing one
 * `<path>` per category with nonzero spending and one `<text>` label per segment
 * positioned near the arc midpoint (Requirements 4.1, 4.2, 4.4).
 *
 * Silently skips if `#visual-chart` is absent (defensive guard).
 *
 * @param {Array<{id: string, itemName: string, amount: number, category: string}>} transactions
 */
function renderChart(transactions) {
  const chartContainer = document.getElementById('visual-chart');
  if (!chartContainer) {
    return;
  }

  // Clear any previous content.
  chartContainer.innerHTML = '';

  const grandTotal = computeTotalBalance(transactions);

  if (transactions.length === 0 || grandTotal === 0) {
    const emptyMessage = document.createElement('p');
    emptyMessage.className = 'empty-state';
    emptyMessage.textContent = 'No spending data is available';
    chartContainer.appendChild(emptyMessage);
    return;
  }

  const categoryTotals = aggregateByCategory(transactions);
  const segments = computeSegmentAngles(categoryTotals, grandTotal);

  const svgNamespace = 'http://www.w3.org/2000/svg';
  const svgElement = document.createElementNS(svgNamespace, 'svg');
  const viewBoxSize = 200;
  const centerX = 100;
  const centerY = 100;
  const radius = 80;
  const labelRadius = 60; // radius for the midpoint label anchor

  svgElement.setAttribute('viewBox', '0 0 ' + viewBoxSize + ' ' + viewBoxSize);
  svgElement.setAttribute('width', String(viewBoxSize));
  svgElement.setAttribute('height', String(viewBoxSize));
  svgElement.setAttribute('aria-label', 'Spending distribution pie chart');

  segments.forEach(function (segment) {
    // --- Wedge path ---
    const pathElement = document.createElementNS(svgNamespace, 'path');
    pathElement.setAttribute('d', describeArc(centerX, centerY, radius, segment.startAngle, segment.endAngle));
    pathElement.setAttribute('fill', segment.color);
    svgElement.appendChild(pathElement);

    // --- Category label positioned at the arc midpoint ---
    const midAngle = (segment.startAngle + segment.endAngle) / 2;
    const midRadians = (midAngle - 90) * (Math.PI / 180);
    const labelX = centerX + labelRadius * Math.cos(midRadians);
    const labelY = centerY + labelRadius * Math.sin(midRadians);

    const textElement = document.createElementNS(svgNamespace, 'text');
    textElement.setAttribute('class', 'chart-label');
    textElement.setAttribute('x', labelX.toFixed(2));
    textElement.setAttribute('y', labelY.toFixed(2));
    textElement.setAttribute('text-anchor', 'middle');
    textElement.setAttribute('dominant-baseline', 'middle');
    textElement.textContent = segment.category;
    svgElement.appendChild(textElement);
  });

  chartContainer.appendChild(svgElement);
}

// === Persistence ===

/**
 * The key used to read and write the transactions array in localStorage.
 * Defined once here so every persistence function references the same constant
 * (Requirement 5.1).
 */
const STORAGE_KEY = 'life-dashboard-transactions';

/**
 * Valid category values, mirrored here for use in deserialize validation.
 * Keeping them as a constant avoids duplicating the literal strings across
 * multiple functions.
 */
const VALID_CATEGORIES = ['Food', 'Transport', 'Fun'];

/**
 * Serializes an array of transaction objects to a JSON string.
 *
 * Pure function: no side effects, no DOM access, no localStorage (Requirement 5.3).
 * Input is assumed to already be valid; no internal validation is performed.
 *
 * @param {Array<{id: string, itemName: string, amount: number, category: string}>} transactions
 * @returns {string} JSON string representation of the transactions array.
 */
function serializeTransactions(transactions) {
  return JSON.stringify(transactions);
}

/**
 * Parses a JSON string back into an array of transaction objects, validating
 * that every item has the required fields and types (Requirement 5.4).
 *
 * Pure function: no side effects, no DOM access, no localStorage.
 *
 * Returns:
 *   { ok: true,  data: Transaction[], error: null }   — on success
 *   { ok: false, data: null,          error: string } — on any failure
 *
 * @param {string} jsonString - The JSON string to parse and validate.
 * @returns {{ ok: boolean, data: Array|null, error: string|null }}
 */
function deserializeTransactions(jsonString) {
  // --- Parse ---
  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch (parseError) {
    return { ok: false, data: null, error: 'Parse error: ' + parseError.message };
  }

  // --- Top-level type check ---
  if (!Array.isArray(parsed)) {
    return { ok: false, data: null, error: 'Expected array' };
  }

  // --- Per-item structural validation ---
  for (let index = 0; index < parsed.length; index++) {
    const item = parsed[index];
    const prefix = 'Invalid item at index ' + index + ': ';

    if (typeof item !== 'object' || item === null) {
      return { ok: false, data: null, error: prefix + 'not an object' };
    }

    // id — non-empty string
    if (typeof item.id !== 'string' || item.id.length === 0) {
      return { ok: false, data: null, error: prefix + 'id must be a non-empty string' };
    }

    // itemName — non-empty string, at most 100 characters
    if (typeof item.itemName !== 'string' || item.itemName.length === 0) {
      return { ok: false, data: null, error: prefix + 'itemName must be a non-empty string' };
    }
    if (item.itemName.length > 100) {
      return { ok: false, data: null, error: prefix + 'itemName must be 100 characters or fewer' };
    }

    // amount — finite positive number
    if (typeof item.amount !== 'number' || !Number.isFinite(item.amount) || item.amount <= 0) {
      return { ok: false, data: null, error: prefix + 'amount must be a finite positive number' };
    }

    // category — one of the allowed values
    if (!VALID_CATEGORIES.includes(item.category)) {
      return { ok: false, data: null, error: prefix + 'category must be one of Food, Transport, Fun' };
    }
  }

  return { ok: true, data: parsed, error: null };
}

/**
 * Writes the serialized transaction array to localStorage under the
 * application's storage key (Requirement 5.1).
 *
 * Returns `true` on success. If localStorage is unavailable or the write
 * throws (e.g. QuotaExceededError), returns `false` without mutating any
 * in-memory state. No alert is shown; the Controller (Task 8.1) surfaces the
 * error via a non-blocking banner (Requirement 5.7).
 *
 * @param {Array<{id: string, itemName: string, amount: number, category: string}>} transactions
 * @returns {boolean} `true` if the write succeeded, `false` otherwise.
 */
function saveTransactions(transactions) {
  try {
    const serialized = serializeTransactions(transactions);
    localStorage.setItem(STORAGE_KEY, serialized);
    return true;
  } catch (_writeError) {
    return false;
  }
}

/**
 * Reads and parses the transaction array from localStorage (Requirements 5.2,
 * 5.6, 5.8).
 *
 * Returns:
 *   { transactions: Transaction[], loadError: false } — key absent (empty start)
 *   { transactions: [],            loadError: true  } — key present but corrupt
 *   { transactions: Transaction[], loadError: false } — key present and valid
 *
 * Never throws; wraps the localStorage access in a try/catch.
 *
 * @returns {{ transactions: Array, loadError: boolean }}
 */
function loadTransactions() {
  let storedValue;
  try {
    storedValue = localStorage.getItem(STORAGE_KEY);
  } catch (_readError) {
    return { transactions: [], loadError: true };
  }

  // Key absent → clean initial state, no error.
  if (storedValue === null) {
    return { transactions: [], loadError: false };
  }

  // Key present → attempt to deserialize; treat any failure as a load error.
  const result = deserializeTransactions(storedValue);
  if (!result.ok) {
    return { transactions: [], loadError: true };
  }

  return { transactions: result.data, loadError: false };
}

// === Controller ===

// Module-level in-memory transactions state. Populated by initDashboard().
// All controller functions read and mutate this variable directly.
var transactions = [];

/**
 * Writes a non-blocking status banner into the page and auto-dismisses it
 * after 5 seconds.
 *
 * Internal helper shared by showPersistenceError, showLoadError, and
 * showDeleteFailure. Creates a `<div>` with the given CSS modifier class and
 * message text, inserts it at the top of `<main>`, then removes it after the
 * dismissal delay.
 *
 * @param {string} modifierClass - BEM modifier class (e.g. 'status-banner--error').
 * @param {string} message       - Human-readable message shown to the user.
 */
function showStatusBanner(modifierClass, message) {
  var mainElement = document.querySelector('main') || document.body;
  var banner = document.createElement('div');
  banner.className = 'status-banner ' + modifierClass;
  banner.setAttribute('role', 'status');
  banner.textContent = message;
  mainElement.insertBefore(banner, mainElement.firstChild);
  setTimeout(function () {
    if (banner.parentNode) {
      banner.parentNode.removeChild(banner);
    }
  }, 5000);
}

/**
 * Orchestrates a full re-render of all three view components from the current
 * in-memory state.
 *
 * Calls renderTransactionList, renderTotalBalance, and renderChart in that
 * order, each receiving the module-level `transactions` array. Does not
 * perform any DOM queries of its own (Requirement 2.4, 3.3, 3.4, 4.3).
 */
function renderAll() {
  renderTransactionList(transactions);
  renderTotalBalance(transactions);
  renderChart(transactions);
}

/**
 * Writes validation error messages into the `#form-validation-message` element
 * so screen readers and sighted users are notified of the offending fields
 * (Requirement 1.4, 1.5).
 *
 * Joins the error strings with '. ' and assigns the result as `textContent`.
 * Silently skips if the element is absent.
 *
 * @param {string[]} errors - Array of human-readable error strings.
 */
function showFormValidation(errors) {
  var messageElement = document.getElementById('form-validation-message');
  if (!messageElement) {
    return;
  }
  messageElement.textContent = errors.join('. ');
}

/**
 * Clears any previously displayed validation messages from the
 * `#form-validation-message` element.
 *
 * Silently skips if the element is absent.
 */
function clearFormValidation() {
  var messageElement = document.getElementById('form-validation-message');
  if (!messageElement) {
    return;
  }
  messageElement.textContent = '';
}

/**
 * Shows a non-blocking persistence-error banner to inform the user that the
 * last write to localStorage failed.
 *
 * The in-memory data is unaffected; the user's work is not lost this session
 * (Requirement 5.7). Auto-dismisses after 5 seconds.
 */
function showPersistenceError() {
  showStatusBanner(
    'status-banner--error',
    'Could not save — changes may be lost on refresh.'
  );
}

/**
 * Shows a non-blocking data-load-error banner to inform the user that stored
 * data could not be parsed and the Dashboard has started with an empty state
 * (Requirement 5.8). Auto-dismisses after 5 seconds.
 */
function showLoadError() {
  showStatusBanner(
    'status-banner--load-error',
    'Could not load saved transactions — starting fresh.'
  );
}

/**
 * Shows a non-blocking delete-failure banner to inform the user that the
 * targeted transaction could not be found (Requirement 2.6).
 * Auto-dismisses after 5 seconds.
 */
function showDeleteFailure() {
  showStatusBanner(
    'status-banner--delete-failure',
    'Could not delete — transaction not found.'
  );
}

/**
 * Handles the transaction form submit event.
 *
 * Control flow (Design: Input_Form section):
 * 1. Prevents the default form submission.
 * 2. Reads the three input field values.
 * 3. Validates via validateTransactionInput:
 *    - Invalid: shows validation errors, returns without mutating state.
 *    - Valid:   clears any previous validation message.
 * 4. Creates a new Transaction object with a unique id.
 * 5. Pushes it onto the in-memory `transactions` array.
 * 6. Persists via saveTransactions; on failure shows a persistence banner
 *    while keeping the transaction in memory.
 * 7. Re-renders all views.
 * 8. Clears all form input fields.
 *
 * @param {Event} event - The form submit event.
 */
function handleFormSubmit(event) {
  event.preventDefault();

  // Read field values.
  var itemNameInput = document.getElementById('item-name-input');
  var amountInput = document.getElementById('amount-input');
  var categorySelect = document.getElementById('category-select');

  var itemName = itemNameInput ? itemNameInput.value : '';
  var amountString = amountInput ? amountInput.value : '';
  var category = categorySelect ? categorySelect.value : '';

  // Validate; bail out if invalid.
  var validationResult = validateTransactionInput(itemName, amountString, category);
  if (!validationResult.valid) {
    showFormValidation(validationResult.errors);
    return;
  }
  clearFormValidation();

  // Build the transaction object with a collision-resistant id.
  var newTransactionId = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : (Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));

  var newTransaction = {
    id: newTransactionId,
    itemName: itemName.trim(),
    amount: parseFloat(amountString),
    category: category,
  };

  // Add to in-memory state.
  transactions.push(newTransaction);

  // Persist; keep the transaction in memory even if the write fails.
  var saveSucceeded = saveTransactions(transactions);
  if (!saveSucceeded) {
    showPersistenceError();
  }

  // Re-render all views to reflect the new state.
  renderAll();

  // Clear form inputs.
  if (itemNameInput) {
    itemNameInput.value = '';
  }
  if (amountInput) {
    amountInput.value = '';
  }
  if (categorySelect) {
    categorySelect.selectedIndex = 0;
  }
}

/**
 * Initialises the Dashboard on DOMContentLoaded.
 *
 * Steps (Design: Controller / Initialization):
 * 1. Loads transactions from localStorage; shows a load-error banner on failure.
 * 2. Calls renderAll() so the initial state is immediately visible.
 * 3. Attaches handleFormSubmit to the transaction form.
 * 4. Attaches a delegated click listener on `#transaction-list` for
 *    `.delete-button` clicks, extracting the transaction id from the
 *    `data-transaction-id` attribute and delegating to handleDeleteTransaction.
 */
function initDashboard() {
  // Load persisted transactions.
  var loadResult = loadTransactions();
  transactions = loadResult.transactions;
  if (loadResult.loadError) {
    showLoadError();
  }

  // Render immediately with the loaded (or empty) state.
  renderAll();

  // Attach the add-transaction submit handler.
  var transactionForm = document.getElementById('transaction-form');
  if (transactionForm) {
    transactionForm.addEventListener('submit', handleFormSubmit);
  }

  // Delegated delete listener: catches clicks on any .delete-button inside the list.
  var transactionList = document.getElementById('transaction-list');
  if (transactionList) {
    transactionList.addEventListener('click', function (clickEvent) {
      var targetElement = clickEvent.target;
      if (targetElement && targetElement.classList.contains('delete-button')) {
        var targetTransactionId = targetElement.getAttribute('data-transaction-id');
        if (targetTransactionId) {
          handleDeleteTransaction(targetTransactionId);
        }
      }
    });
  }
}

// Entry point: wire up the Dashboard when the DOM is ready.
document.addEventListener('DOMContentLoaded', initDashboard);

/**
 * Removes a transaction by id from the in-memory state, persists the updated
 * state, and triggers a full re-render.
 *
 * Controller function: orchestrates state mutation → persist → re-render.
 *
 * If no transaction with the given `transactionId` exists in the in-memory
 * `transactions` array, calls `showDeleteFailure` and returns without mutating
 * state (Requirement 2.6).
 *
 * If `saveTransactions` returns `false` (i.e. the write failed), calls
 * `showPersistenceError`. The in-memory state has already been updated, so the
 * UI still reflects the deletion (Requirement 5.7).
 *
 * Does not throw; wraps the body in try/catch so a runtime error cannot corrupt
 * the application state.
 *
 * @param {string} transactionId - The `id` of the transaction to remove.
 */
function handleDeleteTransaction(transactionId) {
  try {
    // Look up the transaction by id.
    var transactionExists = transactions.some(function (transaction) {
      return transaction.id === transactionId;
    });

    if (!transactionExists) {
      showDeleteFailure(transactionId);
      return;
    }

    // Remove the matching transaction from the array (mutate the module-level state).
    transactions = transactions.filter(function (transaction) {
      return transaction.id !== transactionId;
    });

    // Persist the updated array.
    var saveSucceeded = saveTransactions(transactions);
    if (!saveSucceeded) {
      showPersistenceError();
    }

    // Re-render all views to reflect the deletion.
    renderAll();
  } catch (_unexpectedError) {
    // Swallow unexpected errors to prevent uncaught exceptions from corrupting
    // the in-memory state. Task 8.1 may add error logging here.
  }
}

// === Browser / Test Guard ===
//
// Exposes the pure functions on a single global namespace (DashboardLogic) for
// the browser UI, and exports them for Vitest (CommonJS) so the test harness can
// import them without loading the full page. Downstream tasks add their pure
// functions to this same namespace.
if (typeof window !== 'undefined') {
  window.DashboardLogic = window.DashboardLogic || {};
  window.DashboardLogic.validateTransactionInput = validateTransactionInput;
  window.DashboardLogic.serializeTransactions = serializeTransactions;
  window.DashboardLogic.deserializeTransactions = deserializeTransactions;
  window.DashboardLogic.saveTransactions = saveTransactions;
  window.DashboardLogic.loadTransactions = loadTransactions;
  window.DashboardLogic.computeTotalBalance = computeTotalBalance;
  window.DashboardLogic.aggregateByCategory = aggregateByCategory;
  window.DashboardLogic.computeSegmentAngles = computeSegmentAngles;
  window.DashboardLogic.describeArc = describeArc;
  window.DashboardLogic.renderTransactionList = renderTransactionList;
  window.DashboardLogic.renderAll = renderAll;
  window.DashboardLogic.showFormValidation = showFormValidation;
  window.DashboardLogic.clearFormValidation = clearFormValidation;
  window.DashboardLogic.showPersistenceError = showPersistenceError;
  window.DashboardLogic.showLoadError = showLoadError;
  window.DashboardLogic.showDeleteFailure = showDeleteFailure;
  window.DashboardLogic.handleFormSubmit = handleFormSubmit;
  window.DashboardLogic.initDashboard = initDashboard;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    validateTransactionInput,
    serializeTransactions,
    deserializeTransactions,
    saveTransactions,
    loadTransactions,
    computeTotalBalance,
    renderTotalBalance,
    aggregateByCategory,
    computeSegmentAngles,
    describeArc,
    renderChart,
    renderTransactionList,
    handleDeleteTransaction,
    renderAll,
    showFormValidation,
    clearFormValidation,
    showPersistenceError,
    showLoadError,
    showDeleteFailure,
    handleFormSubmit,
    initDashboard,
    // Expose the module-level state so tests can seed and read it directly.
    get transactions() { return transactions; },
    set transactions(value) { transactions = value; },
  };
}
