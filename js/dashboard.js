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
  const isValidCategory = categoryRegistry.some(function (entry) {
    return entry.name === category;
  });
  if (!isValidCategory) {
    errors.push('Category must be one of the registered categories.');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates the input for a new custom category.
 *
 * Pure function: no side effects, no DOM access, no localStorage. Returns an
 * object describing whether the input is valid and, if not, a list of
 * human-readable error messages covering every violation found.
 *
 * Rules (Requirements 2.1, 2.2, 2.3, 2.4, 2.7):
 *   - name is invalid if its trimmed value has fewer than one non-whitespace
 *     character (empty or whitespace-only).
 *   - name is invalid if it is longer than 50 characters.
 *   - name is invalid if it already exists in `registry`, compared
 *     case-insensitively.
 *   - color is invalid if it is an empty or missing string.
 *   - All violations are collected before returning (multi-error reporting).
 *
 * @param {string} name  - Raw category name text (may have leading/trailing whitespace).
 * @param {string} color - Category color string (expected hex, e.g. "#ea580c").
 * @param {Array<{ name: string, color: string, isDefault: boolean }>} registry
 *   The current category registry to check for duplicate names.
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateCategoryInput(name, color, registry) {
  const errors = [];

  // Defensively coerce non-strings so the checks below never throw.
  const nameText = typeof name === 'string' ? name : '';
  const trimmedName = nameText.trim();

  // --- Name: must contain at least one non-whitespace character ---
  if (trimmedName.length < 1) {
    errors.push('Category name must contain at least one non-whitespace character.');
  }

  // --- Name: must not exceed 50 characters ---
  if (nameText.length > 50) {
    errors.push('Category name must be 50 characters or fewer.');
  }

  // --- Name: must not duplicate an existing entry (case-insensitive) ---
  const registryArray = Array.isArray(registry) ? registry : [];
  const lowerTrimmedName = trimmedName.toLowerCase();
  if (trimmedName.length > 0) {
    const isDuplicate = registryArray.some(function (entry) {
      return typeof entry.name === 'string' &&
        entry.name.trim().toLowerCase() === lowerTrimmedName;
    });
    if (isDuplicate) {
      errors.push('Category name is already used.');
    }
  }

  // --- Color: must be a non-empty string ---
  const colorText = typeof color === 'string' ? color : '';
  if (colorText.trim().length === 0) {
    errors.push('A color must be selected.');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Builds the full Category_Registry from a list of custom category entries.
 *
 * Always prepends the three Default_Category entries, then appends each custom
 * entry — skipping any whose name matches a Default_Category name
 * (case-insensitive).
 *
 * Pure function: no DOM access, no localStorage reads or writes.
 *
 * Requirements: 1.1, 3.2
 *
 * @param {Array<{ name: string, color: string }>} customCategories
 *   Custom category entries to merge into the registry.
 * @returns {Array<{ name: string, color: string, isDefault: boolean }>}
 *   Full registry with Default_Category entries first, followed by valid
 *   custom entries.
 */
function buildCategoryRegistry(customCategories) {
  const DEFAULT_CATEGORIES = [
    { name: 'Food',      color: '#ea580c', isDefault: true },
    { name: 'Transport', color: '#059669', isDefault: true },
    { name: 'Fun',       color: '#db2777', isDefault: true },
  ];

  const defaultNames = DEFAULT_CATEGORIES.map(function (entry) {
    return entry.name.toLowerCase();
  });

  const customArray = Array.isArray(customCategories) ? customCategories : [];
  const customEntries = customArray
    .filter(function (entry) {
      if (!entry || typeof entry.name !== 'string') return false;
      return !defaultNames.includes(entry.name.trim().toLowerCase());
    })
    .map(function (entry) {
      return { name: entry.name, color: entry.color, isDefault: false };
    });

  return DEFAULT_CATEGORIES.concat(customEntries);
}

// === Domain Logic ===

/**
 * Computes the monthly spending summary grouped by category.
 *
 * Pure function: no DOM access, no side effects, no localStorage. Reads the
 * module-level `categoryRegistry` to determine which category keys to include.
 *
 * Rules (Requirements 5.1, 5.2, 5.3, 5.4, 5.6, 5.7):
 *   - Returns an object with one key per category in `categoryRegistry`; each
 *     value is the two-decimal-place sum of amounts for transactions whose
 *     `createdAt` field (ISO 8601 date string "YYYY-MM-DD") matches `year` and
 *     `month`.
 *   - Returns all-zero values when `year` is outside 2000–2100 or `month` is
 *     outside 1–12.
 *   - Transactions with null, undefined, or non-ISO-8601-date `createdAt` are
 *     ignored.
 *   - Rounding uses `Math.round(value * 100) / 100`.
 *
 * @param {Array<{id: string, itemName: string, amount: number, category: string, createdAt: string}>} transactions
 * @param {number} year  - Integer year (valid range: 2000–2100 inclusive).
 * @param {number} month - Integer month (valid range: 1–12 inclusive).
 * @returns {{ [categoryName: string]: number }}
 */
function computeMonthlySummary(transactions, year, month) {
  // Build the zero-value result object from the current registry.
  var result = {};
  categoryRegistry.forEach(function (entry) {
    result[entry.name] = 0;
  });

  // Guard: year/month out of valid range → return all zeros.
  if (year < 2000 || year > 2100 || month < 1 || month > 12) {
    return result;
  }

  // Pad month to two digits for string comparison (e.g. 2026-04).
  var monthStr = (month < 10 ? '0' : '') + month;
  var prefix = year + '-' + monthStr + '-';

  // ISO 8601 date format: YYYY-MM-DD (exactly 10 characters).
  var isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

  transactions.forEach(function (transaction) {
    var createdAt = transaction.createdAt;

    // Ignore null, undefined, or non-string values.
    if (createdAt == null || typeof createdAt !== 'string') {
      return;
    }

    // Ignore strings that don't match YYYY-MM-DD format.
    if (!isoDatePattern.test(createdAt)) {
      return;
    }

    // Check that the date falls in the requested year/month.
    if (createdAt.slice(0, 8) !== prefix) {
      return;
    }

    // Accumulate to the matching category key (ignore unknown categories).
    var cat = transaction.category;
    if (Object.prototype.hasOwnProperty.call(result, cat)) {
      result[cat] += transaction.amount;
    }
  });

  // Apply two-decimal rounding to every accumulated total.
  Object.keys(result).forEach(function (cat) {
    result[cat] = Math.round(result[cat] * 100) / 100;
  });

  return result;
}

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

/**
 * Returns a sorted copy of the transactions array according to `sortOrder`.
 *
 * Pure function: never mutates the input array (Requirements 6.1–6.5).
 *
 * Sort orders:
 *   'newest'      — createdAt descending; ties broken by id descending.
 *   'oldest'      — createdAt ascending;  ties broken by id ascending.
 *   'amount-desc' — amount descending;    ties broken by createdAt descending then id descending.
 *   'amount-asc'  — amount ascending;     ties broken by createdAt ascending  then id ascending.
 *   unknown       — returns a shallow copy in original order.
 *
 * @param {Array<{id: number, itemName: string, amount: number, category: string, createdAt: string}>} transactions
 * @param {string} sortOrder
 * @returns {Array}
 */
function sortTransactions(transactions, sortOrder) {
  // Always work on a shallow copy so the input is never mutated.
  var copy = transactions.slice();

  if (sortOrder === 'newest') {
    copy.sort(function (a, b) {
      if (a.createdAt < b.createdAt) return 1;
      if (a.createdAt > b.createdAt) return -1;
      // Tie-break: id descending
      if (a.id < b.id) return 1;
      if (a.id > b.id) return -1;
      return 0;
    });
  } else if (sortOrder === 'oldest') {
    copy.sort(function (a, b) {
      if (a.createdAt < b.createdAt) return -1;
      if (a.createdAt > b.createdAt) return 1;
      // Tie-break: id ascending
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    });
  } else if (sortOrder === 'amount-desc') {
    copy.sort(function (a, b) {
      if (b.amount !== a.amount) return b.amount - a.amount;
      // Tie-break: createdAt descending
      if (a.createdAt < b.createdAt) return 1;
      if (a.createdAt > b.createdAt) return -1;
      // Tie-break: id descending
      if (a.id < b.id) return 1;
      if (a.id > b.id) return -1;
      return 0;
    });
  } else if (sortOrder === 'amount-asc') {
    copy.sort(function (a, b) {
      if (a.amount !== b.amount) return a.amount - b.amount;
      // Tie-break: createdAt ascending
      if (a.createdAt < b.createdAt) return -1;
      if (a.createdAt > b.createdAt) return 1;
      // Tie-break: id ascending
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    });
  }
  // Unknown sortOrder: return the copy in original order (no sort applied).

  return copy;
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
 * Aggregates transaction amounts by category, returning an object keyed by
 * every category name in the current `categoryRegistry`.
 *
 * Derives its category list from the module-level `categoryRegistry` so that
 * custom categories are included automatically (Requirements 1.2, 1.3).
 * Each property value is the epsilon-rounded two-decimal sum of `amount` for
 * all transactions whose `category` matches that key.
 * Categories with no matching transactions are `0`.
 * Transactions whose category is not in the registry are silently ignored.
 *
 * @param {Array<{id: string, itemName: string, amount: number, category: string}>} transactions
 * @returns {Object.<string, number>} One key per registry entry; value is the rounded sum.
 */
function aggregateByCategory(transactions) {
  // Build the totals object dynamically from the current categoryRegistry so
  // that custom categories are included automatically (Requirements 1.2, 1.3).
  var totals = {};
  categoryRegistry.forEach(function (entry) {
    totals[entry.name] = 0;
  });

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

  // Iterate over all keys in categoryTotals (derived from categoryRegistry)
  // so the chart reflects the full dynamic registry, not a hardcoded list.
  const categoryOrder = Object.keys(categoryTotals);
  categoryOrder.forEach(function (category) {
    const categoryTotal = categoryTotals[category];
    if (categoryTotal <= 0) {
      return; // skip absent categories
    }

    const fraction = categoryTotal / grandTotal;
    const angleDegrees = fraction * 360;
    const startAngle = accumulatedDegrees;
    const endAngle = startAngle + angleDegrees;

    // Look up color from the module-level categoryRegistry by name (case-sensitive).
    // Fall back to a neutral color if no matching entry is found.
    const registryEntry = categoryRegistry.find(function (entry) {
      return entry.name === category;
    });
    const segmentColor = registryEntry ? registryEntry.color : '#aaaaaa';

    segments.push({
      category: category,
      startAngle: startAngle,
      endAngle: endAngle,
      color: segmentColor,
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

  // Apply current sort order before rendering (Requirement 6.6).
  transactions = sortTransactions(transactions, activeSortOrder);

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

  const filteredTransactions = activeMonth !== null
    ? transactions.filter(function (t) { return t.createdAt.startsWith(activeMonth); })
    : transactions;

  const grandTotal = computeTotalBalance(filteredTransactions);

  if (filteredTransactions.length === 0 || grandTotal === 0) {
    const emptyMessage = document.createElement('p');
    emptyMessage.className = 'empty-state';
    emptyMessage.textContent = 'No spending data is available';
    chartContainer.appendChild(emptyMessage);
    return;
  }

  const categoryTotals = aggregateByCategory(filteredTransactions);
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

/**
 * Renders the Monthly Summary Panel into the `#summary-panel` DOM container.
 *
 * Writes the human-readable month/year heading into `#summary-month-title`
 * (e.g. "November 2026"), then either renders per-category spending rows or
 * an empty-state message, depending on whether any transactions exist for the
 * requested period (Requirements 4.1, 4.2, 4.5, 4.6, 4.9, 4.10).
 *
 * Layout written into `#summary-content`:
 *   - Zero totals: one `<p class="empty-state">` with the "No spending" message.
 *   - Non-zero totals: one `<div class="summary-row">` per category with a
 *     nonzero total; each row contains:
 *       - `<span class="summary-category-name">` — the category name.
 *       - `<span class="summary-amount">` — the total formatted as `$X.XX`.
 *
 * Silently skips if `#summary-panel`, `#summary-content`, or
 * `#summary-month-title` are absent (defensive guard).
 *
 * @param {Array<{id: string, itemName: string, amount: number, category: string, createdAt: string}>} transactions
 * @param {number} year  - Integer year (valid range: 2000–2100 inclusive).
 * @param {number} month - Integer month (valid range: 1–12 inclusive).
 * @param {Array<{ name: string, color: string, isDefault: boolean }>} registry
 *   The current category registry (used only for display ordering).
 */
function renderSummaryPanel(transactions, year, month, registry) {
  var summaryPanel = document.getElementById('summary-panel');
  var summaryContent = document.getElementById('summary-content');
  var summaryMonthTitle = document.getElementById('summary-month-title');

  // Silently skip if any required element is missing.
  if (!summaryPanel || !summaryContent || !summaryMonthTitle) {
    return;
  }

  // Build the human-readable month/year heading (e.g. "November 2026").
  var MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  var monthLabel = (month >= 1 && month <= 12) ? MONTH_NAMES[month - 1] : 'Unknown';
  var headingText = monthLabel + ' ' + year;
  summaryMonthTitle.textContent = headingText;

  // Clear any previously rendered content.
  summaryContent.innerHTML = '';

  // Compute per-category totals for the requested period.
  var totals = computeMonthlySummary(transactions, year, month);

  // Check whether any category has a nonzero total.
  var hasData = Object.keys(totals).some(function (cat) {
    return totals[cat] > 0;
  });

  if (!hasData) {
    // Empty-state: year/month out of range, or no transactions for this period.
    var emptyParagraph = document.createElement('p');
    emptyParagraph.className = 'empty-state';
    emptyParagraph.textContent = 'No spending for ' + headingText;
    summaryContent.appendChild(emptyParagraph);
    return;
  }

  // Render one row per category that has a nonzero total.
  // Follow the registry order so rows always appear in a predictable sequence.
  var registryArray = Array.isArray(registry) ? registry : [];
  registryArray.forEach(function (entry) {
    var total = totals[entry.name];
    if (!total || total <= 0) {
      return; // skip categories with no spending this month
    }

    var rowDiv = document.createElement('div');
    rowDiv.className = 'summary-row';

    var nameSpan = document.createElement('span');
    nameSpan.className = 'summary-category-name';
    nameSpan.textContent = entry.name;

    var amountSpan = document.createElement('span');
    amountSpan.className = 'summary-amount';
    amountSpan.textContent = '$' + total.toFixed(2);

    rowDiv.appendChild(nameSpan);
    rowDiv.appendChild(amountSpan);
    summaryContent.appendChild(rowDiv);
  });
}

/**
 * Re-populates the `#transaction-category` (alias `#category-select`) dropdown
 * with the current Category_Registry entries.
 *
 * Clears all existing options, adds a placeholder option first, then appends
 * one `<option>` per registry entry in registry order (Default_Category first,
 * then Custom_Category).
 *
 * Silently skips if the element is absent (Requirements 1.5, 3.4).
 *
 * @param {CategoryEntry[]} registry - The current category registry array.
 */
function refreshCategoryDropdown(registry) {
  var selectElement = document.getElementById('transaction-category');
  if (!selectElement) {
    return;
  }

  // Remove all existing options.
  selectElement.innerHTML = '';

  // Placeholder option.
  var placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select category';
  selectElement.appendChild(placeholder);

  // One option per registry entry.
  registry.forEach(function (entry) {
    var option = document.createElement('option');
    option.value = entry.name;
    option.textContent = entry.name;
    selectElement.appendChild(option);
  });
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

/**
 * Writes the custom categories array to localStorage under the key
 * `'life-dashboard-custom-categories'`.
 *
 * Returns `true` on success. If localStorage is unavailable or the write
 * throws for any reason (e.g. QuotaExceededError), returns `false` without
 * mutating any in-memory state (Requirements 1.4, 3.1).
 *
 * @param {Array<{ name: string, color: string }>} customCategories
 *   The array of custom category entries to persist.
 * @returns {boolean} `true` if the write succeeded, `false` otherwise.
 */
function saveCustomCategories(customCategories) {
  try {
    localStorage.setItem('life-dashboard-custom-categories', JSON.stringify(customCategories));
    return true;
  } catch (_writeError) {
    return false;
  }
}

/**
 * Reads Custom_Category entries from localStorage.
 *
 * Returns `{ customCategories: [], loadError: false }` when the key is absent.
 * Returns `{ customCategories: [], loadError: true }` when the stored value
 * cannot be parsed as JSON or is not a valid array of `{ name: string, color: string }`
 * objects (Requirements 1.8, 1.9, 3.3).
 * Returns `{ customCategories: <parsed array>, loadError: false }` on success.
 *
 * @returns {{ customCategories: Array<{ name: string, color: string }>, loadError: boolean }}
 */
function loadCustomCategories() {
  var raw = localStorage.getItem('life-dashboard-custom-categories');

  // Key absent — normal first-run case
  if (raw === null) {
    return { customCategories: [], loadError: false };
  }

  // Attempt to parse; treat any parse error as invalid data
  var parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_parseError) {
    return { customCategories: [], loadError: true };
  }

  // Must be an array
  if (!Array.isArray(parsed)) {
    return { customCategories: [], loadError: true };
  }

  // Every element must be a plain object with string `name` and string `color`
  for (var i = 0; i < parsed.length; i++) {
    var entry = parsed[i];
    if (
      entry === null ||
      typeof entry !== 'object' ||
      Array.isArray(entry) ||
      typeof entry.name !== 'string' ||
      typeof entry.color !== 'string'
    ) {
      return { customCategories: [], loadError: true };
    }
  }

  return { customCategories: parsed, loadError: false };
}

// === Controller ===

// Category registry — the master list of available categories.
// Each entry: { name: string, color: string, isDefault: boolean }
// Default_Category entries are pre-seeded here and must not be deleted by the user
// (Requirement 6.1). User-created entries are appended at runtime (Requirement 6.2).
var categoryRegistry = [
  { name: 'Food',      color: '#ea580c', isDefault: true },
  { name: 'Transport', color: '#059669', isDefault: true },
  { name: 'Fun',       color: '#db2777', isDefault: true },
];

// User-added custom category entries (not including Default_Category defaults).
// Each entry shape: { name: string, color: string }
// Populated during initDashboard from localStorage, then grown by handleAddCategory.
// Kept separate from categoryRegistry so buildCategoryRegistry can always
// reconstruct the full registry deterministically from just this array.
var customCategories = [];

// Active sort order for the transaction list (Requirement 3.1).
// Supported values: 'newest' | 'oldest' | 'amount-desc' | 'amount-asc'
// Defaults to 'newest' so the most recent entry appears at the top.
var activeSortOrder = 'newest';

// Active month filter (ISO-8601 'YYYY-MM' string, or null for "all months") (Requirement 4.1).
// When non-null, only transactions whose createdAt timestamp falls in this month are shown.
var activeMonth = null;

// Module-level in-memory transactions state. Populated by initDashboard().
// All controller functions read and mutate this variable directly.
// Each transaction object shape:
//   { id: string, itemName: string, amount: number, category: string,
//     createdAt: string }  — createdAt is an ISO-8601 datetime string
//     (e.g. "2024-06-01T12:00:00.000Z") recorded at the moment the transaction
//     is created (Requirement 1.1). Used for chronological sorting and month filtering.
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

  // Derive year and month from the activeMonth 'YYYY-MM' string, or fall back
  // to the current calendar month when activeMonth is null.
  var activeMonth_year, activeMonth_month;
  if (activeMonth !== null) {
    var parts = activeMonth.split('-');
    activeMonth_year = parseInt(parts[0], 10);
    activeMonth_month = parseInt(parts[1], 10);
  } else {
    var now = new Date();
    activeMonth_year = now.getFullYear();
    activeMonth_month = now.getMonth() + 1;
  }
  renderSummaryPanel(transactions, activeMonth_year, activeMonth_month, categoryRegistry);
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
 * Handles the category form submit event.
 *
 * Control flow (Requirements 2.1–2.9, 3.1):
 * 1. Prevents the default form submission.
 * 2. Reads `name` from `#category-name-input` and `color` from
 *    `#category-color-input`.
 * 3. Validates via `validateCategoryInput(name, color, categoryRegistry)`:
 *    - Invalid: joins error strings with '. ' and writes them into
 *      `#category-validation-message`; returns without mutating state.
 *    - Valid: clears `#category-validation-message`.
 * 4. Creates a new `{ name: name.trim(), color }` entry and pushes it onto
 *    the module-level `customCategories` array.
 * 5. Rebuilds `categoryRegistry` by calling `buildCategoryRegistry(customCategories)`.
 * 6. Calls `saveCustomCategories(customCategories)`:
 *    - If it returns `false`, shows the `status-banner--category-data-error`
 *      banner via `showStatusBanner` and returns without clearing the form
 *      (Requirement 2.6).
 * 7. On successful save: clears `#category-name-input`, clears
 *    `#category-validation-message`, calls `refreshCategoryDropdown(categoryRegistry)`,
 *    and calls `renderAll()`.
 *
 * @param {Event} event - The form submit event.
 */
function handleAddCategory(event) {
  event.preventDefault();

  // Read field values.
  var categoryNameInput = document.getElementById('category-name-input');
  var categoryColorInput = document.getElementById('category-color-input');
  var categoryValidationMessage = document.getElementById('category-validation-message');

  var name = categoryNameInput ? categoryNameInput.value : '';
  var color = categoryColorInput ? categoryColorInput.value : '';

  // Validate; bail out if invalid.
  var validationResult = validateCategoryInput(name, color, categoryRegistry);
  if (!validationResult.valid) {
    if (categoryValidationMessage) {
      categoryValidationMessage.textContent = validationResult.errors.join('. ');
    }
    return;
  }

  // Clear any previous validation message.
  if (categoryValidationMessage) {
    categoryValidationMessage.textContent = '';
  }

  // Build and append the new custom entry.
  var newEntry = { name: name.trim(), color: color };
  customCategories.push(newEntry);

  // Rebuild the full registry from the updated custom list.
  categoryRegistry = buildCategoryRegistry(customCategories);

  // Persist the custom categories.
  var saveSucceeded = saveCustomCategories(customCategories);
  if (!saveSucceeded) {
    showStatusBanner(
      'status-banner--category-data-error',
      'Could not save category — changes may be lost on refresh.'
    );
    return;
  }

  // Clear the name input (color input retains its last value as a sensible default).
  if (categoryNameInput) {
    categoryNameInput.value = '';
  }

  // Refresh the transaction category dropdown and re-render all views.
  refreshCategoryDropdown(categoryRegistry);
  renderAll();
}

/**
 * Handles a month navigation button click, moving `activeMonth` forward or
 * backward by one calendar month.
 *
 * Steps (Requirements 5.5, 5.9, 5.10):
 * 1. If `activeMonth` is null, initialise it to the current year/month in
 *    'YYYY-MM' format before applying the direction.
 * 2. Parse the year and month integers from `activeMonth`.
 * 3. Advance (`'next'`) or retreat (`'prev'`) by one month, rolling the year
 *    when the month crosses the December/January boundary.
 * 4. Write the new value back to `activeMonth` as 'YYYY-MM'.
 * 5. Update `#month-display` text content with the human-readable label
 *    (e.g. "May 2025").
 * 6. Call `renderAll()` to refresh all panels.
 *
 * @param {'prev'|'next'} direction - Which direction to navigate.
 */
function handleMonthNav(direction) {
  // Step 1: initialise to the current calendar month if activeMonth is null.
  if (activeMonth === null) {
    var now = new Date();
    var initYear = now.getFullYear();
    var initMonth = now.getMonth() + 1; // 1–12
    var initMonthStr = (initMonth < 10 ? '0' : '') + initMonth;
    activeMonth = initYear + '-' + initMonthStr;
  }

  // Step 2: parse current year and month from the 'YYYY-MM' string.
  var parts = activeMonth.split('-');
  var year = parseInt(parts[0], 10);
  var month = parseInt(parts[1], 10);

  // Step 3: advance or retreat, with year rollover.
  if (direction === 'next') {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  } else {
    // 'prev'
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
  }

  // Step 4: write the new 'YYYY-MM' string back.
  var monthStr = (month < 10 ? '0' : '') + month;
  activeMonth = year + '-' + monthStr;

  // Step 5: update the #month-display element with the human-readable label.
  var MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  var monthLabel = MONTH_NAMES[month - 1];
  var monthDisplayElement = document.getElementById('month-display');
  if (monthDisplayElement) {
    monthDisplayElement.textContent = monthLabel + ' ' + year;
  }

  // Step 6: re-render all views.
  renderAll();
}

/**
 * Handles a change on the sort-order `<select>` element.
 *
 * Steps (Requirement 6.7):
 * 1. Read the new sort-order value from `event.target.value`.
 * 2. Update the module-level `activeSortOrder` to the new value.
 * 3. Call `renderAll()` to re-render all views with the new sort applied.
 *
 * @param {Event} event - The `change` event fired by the sort-order select.
 */
function handleSortChange(event) {
  // Step 1: read the chosen sort order from the select element.
  var newSortOrder = event.target.value;

  // Step 2: persist it into module-level state.
  activeSortOrder = newSortOrder;

  // Step 3: re-render all views so the transaction list reflects the new order.
  renderAll();
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

  // Load persisted custom categories (Requirement 1.7, 6.7).
  var categoryLoadResult = loadCustomCategories();
  if (categoryLoadResult.loadError) {
    showStatusBanner('status-banner--category-data-error', 'Could not load saved categories. Your custom categories may have been reset.');
  } else {
    customCategories = categoryLoadResult.customCategories;
  }

  // Rebuild the category registry from the loaded custom categories (Requirement 1.8, 6.7).
  categoryRegistry = buildCategoryRegistry(customCategories);

  // Populate the category <select> from the registry (Requirement 1.9, 3.3).
  refreshCategoryDropdown(categoryRegistry);

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

  // Wire add-category form (Requirement 2.8).
  var addCategoryForm = document.getElementById('add-category-form');
  if (addCategoryForm && !addCategoryForm._categoryHandlerAttached) {
    addCategoryForm.addEventListener('submit', handleAddCategory);
    addCategoryForm._categoryHandlerAttached = true;
  }

  // Wire month-navigation buttons (Requirement 3.4, 5.9).
  var prevMonthBtn = document.getElementById('prev-month-btn');
  if (prevMonthBtn && !prevMonthBtn._monthNavHandlerAttached) {
    prevMonthBtn.addEventListener('click', function () { handleMonthNav('prev'); });
    prevMonthBtn._monthNavHandlerAttached = true;
  }

  var nextMonthBtn = document.getElementById('next-month-btn');
  if (nextMonthBtn && !nextMonthBtn._monthNavHandlerAttached) {
    nextMonthBtn.addEventListener('click', function () { handleMonthNav('next'); });
    nextMonthBtn._monthNavHandlerAttached = true;
  }

  // Wire sort-order select (Requirement 3.3).
  var sortSelect = document.getElementById('sort-select');
  if (sortSelect && !sortSelect._sortHandlerAttached) {
    sortSelect.addEventListener('change', handleSortChange);
    sortSelect._sortHandlerAttached = true;
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
  window.DashboardLogic.validateCategoryInput = validateCategoryInput;
  window.DashboardLogic.buildCategoryRegistry = buildCategoryRegistry;
  window.DashboardLogic.computeMonthlySummary = computeMonthlySummary;
  window.DashboardLogic.sortTransactions = sortTransactions;
  window.DashboardLogic.saveCustomCategories = saveCustomCategories;
  window.DashboardLogic.loadCustomCategories = loadCustomCategories;
  window.DashboardLogic.serializeTransactions = serializeTransactions;
  window.DashboardLogic.deserializeTransactions = deserializeTransactions;
  window.DashboardLogic.saveTransactions = saveTransactions;
  window.DashboardLogic.loadTransactions = loadTransactions;
  window.DashboardLogic.computeTotalBalance = computeTotalBalance;
  window.DashboardLogic.aggregateByCategory = aggregateByCategory;
  window.DashboardLogic.computeSegmentAngles = computeSegmentAngles;
  window.DashboardLogic.describeArc = describeArc;
  window.DashboardLogic.renderTransactionList = renderTransactionList;
  window.DashboardLogic.renderSummaryPanel = renderSummaryPanel;
  window.DashboardLogic.refreshCategoryDropdown = refreshCategoryDropdown;
  window.DashboardLogic.renderAll = renderAll;
  window.DashboardLogic.showFormValidation = showFormValidation;
  window.DashboardLogic.clearFormValidation = clearFormValidation;
  window.DashboardLogic.showPersistenceError = showPersistenceError;
  window.DashboardLogic.showLoadError = showLoadError;
  window.DashboardLogic.showDeleteFailure = showDeleteFailure;
  window.DashboardLogic.handleFormSubmit = handleFormSubmit;
  window.DashboardLogic.handleAddCategory = handleAddCategory;
  window.DashboardLogic.handleMonthNav = handleMonthNav;
  window.DashboardLogic.handleSortChange = handleSortChange;
  window.DashboardLogic.initDashboard = initDashboard;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    validateTransactionInput,
    validateCategoryInput,
    buildCategoryRegistry,
    computeMonthlySummary,
    sortTransactions,
    saveCustomCategories,
    loadCustomCategories,
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
    renderSummaryPanel,
    refreshCategoryDropdown,
    handleDeleteTransaction,
    renderAll,
    showFormValidation,
    clearFormValidation,
    showPersistenceError,
    showLoadError,
    showDeleteFailure,
    handleFormSubmit,
    handleAddCategory,
    handleMonthNav,
    handleSortChange,
    initDashboard,
    // Expose the module-level state so tests can seed and read it directly.
    get transactions() { return transactions; },
    set transactions(value) { transactions = value; },
    get categoryRegistry() { return categoryRegistry; },
    set categoryRegistry(value) { categoryRegistry = value; },
    get customCategories() { return customCategories; },
    set customCategories(value) { customCategories = value; },
    get activeMonth() { return activeMonth; },
    set activeMonth(value) { activeMonth = value; },
    get activeSortOrder() { return activeSortOrder; },
    set activeSortOrder(value) { activeSortOrder = value; },
  };
}
