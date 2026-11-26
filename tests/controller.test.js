/*
 * tests/controller.test.js — unit and property-based tests for the Controller
 * section of js/dashboard.js (Task 8.1).
 *
 * Covers Design Correctness Properties 12 and 13 (form submit with valid /
 * invalid input) and unit tests for renderAll, form validation display,
 * initDashboard, handleFormSubmit, and status banners.
 *
 * Run with: npx vitest --run
 */

const fc = require('fast-check');
const dashboard = require('../js/dashboard.js');

// ---------------------------------------------------------------------------
// Helpers: build a minimal DOM suitable for the controller functions
// ---------------------------------------------------------------------------

/**
 * Inserts the minimum HTML elements that the controller reads and writes.
 * Called at the start of each relevant test so tests are isolated.
 */
function buildDOM() {
  document.body.innerHTML = `
    <main>
      <div id="total-balance-display"></div>
      <form id="transaction-form">
        <input id="item-name-input" type="text" value="">
        <input id="amount-input"    type="text" value="">
        <select id="category-select">
          <option value="Food">Food</option>
          <option value="Transport">Transport</option>
          <option value="Fun">Fun</option>
        </select>
        <button id="submit-button" type="submit">Add Transaction</button>
        <div id="form-validation-message" role="alert"></div>
      </form>
      <div id="transaction-list"></div>
      <div id="visual-chart"></div>
    </main>
  `;
}

/**
 * Returns a synthetic submit Event that targets the transaction form.
 * We call event.preventDefault() inside handleFormSubmit; we stub it here
 * so it does not throw in jsdom.
 */
function makeSubmitEvent() {
  var event = new Event('submit', { bubbles: true, cancelable: true });
  return event;
}

/**
 * Formats a cent integer as a dollar string with two decimal places.
 * 1 → "0.01", 12345 → "123.45".
 */
function formatAmountFromCents(cents) {
  var dollars = Math.floor(cents / 100);
  var centsPart = cents % 100;
  var centsString = centsPart < 10 ? '0' + centsPart : String(centsPart);
  return dollars + '.' + centsString;
}

// ---------------------------------------------------------------------------
// fast-check generators for valid inputs
// ---------------------------------------------------------------------------

var validAmountArb = fc.integer({ min: 1, max: 99999999999 }).map(formatAmountFromCents);
var validCategoryArb = fc.constantFrom('Food', 'Transport', 'Fun');
// Item names: 1–50 printable characters, non-whitespace-only
var validItemNameArb = fc
  .integer({ min: 1, max: 50 })
  .map(function (length) { return 'item' + 'x'.repeat(length - 1); });

// ---------------------------------------------------------------------------
// fast-check generators for invalid inputs
// ---------------------------------------------------------------------------

// Whitespace-only names
var whitespaceNameArb = fc
  .array(fc.constantFrom(' ', '\t', '\n'), { minLength: 0, maxLength: 20 })
  .map(function (chars) { return chars.join(''); });

// Invalid amount strings
var invalidAmountArb = fc.oneof(
  fc.constantFrom('', 'abc', 'xyz', '1e3', 'NaN', '--5', '1.2.3'),
  fc.integer({ min: -1000, max: 0 }).map(function (n) { return String(n); }),
  fc.constantFrom('-0.01', '0', '0.0', '0.001', '1000000000.01')
);

// ===========================================================================
// renderAll — unit tests
// ===========================================================================

describe('renderAll', function () {
  beforeEach(function () {
    buildDOM();
    // Reset module-level transactions to an empty state before each test.
    dashboard.transactions = [];
  });

  it('calls all three renderers: list, balance, and chart', function () {
    // Seed one transaction so non-empty renders are exercised.
    dashboard.transactions = [
      { id: 'a1', itemName: 'Coffee', amount: 3.50, category: 'Food' },
    ];

    dashboard.renderAll();

    // List should contain a transaction row.
    var listContainer = document.getElementById('transaction-list');
    expect(listContainer.querySelector('.transaction-row')).not.toBeNull();

    // Balance should be updated.
    var balanceDisplay = document.getElementById('total-balance-display');
    expect(balanceDisplay.textContent).toContain('3.50');

    // Chart should contain an SVG (non-empty state with one transaction).
    var chartContainer = document.getElementById('visual-chart');
    expect(chartContainer.querySelector('svg')).not.toBeNull();
  });

  it('renders the empty state when transactions is empty', function () {
    dashboard.transactions = [];
    dashboard.renderAll();

    var listContainer = document.getElementById('transaction-list');
    expect(listContainer.querySelector('.empty-state')).not.toBeNull();

    var chartContainer = document.getElementById('visual-chart');
    expect(chartContainer.querySelector('.empty-state')).not.toBeNull();

    var balanceDisplay = document.getElementById('total-balance-display');
    expect(balanceDisplay.textContent).toContain('0.00');
  });
});

// ===========================================================================
// showFormValidation / clearFormValidation — unit tests
// ===========================================================================

describe('showFormValidation and clearFormValidation', function () {
  beforeEach(function () { buildDOM(); });

  it('showFormValidation with two errors sets non-empty text on #form-validation-message', function () {
    dashboard.showFormValidation(['Error one', 'Error two']);
    var messageElement = document.getElementById('form-validation-message');
    expect(messageElement.textContent.length).toBeGreaterThan(0);
    expect(messageElement.textContent).toContain('Error one');
    expect(messageElement.textContent).toContain('Error two');
  });

  it('clearFormValidation empties #form-validation-message', function () {
    var messageElement = document.getElementById('form-validation-message');
    messageElement.textContent = 'Some previous error';
    dashboard.clearFormValidation();
    expect(messageElement.textContent).toBe('');
  });

  it('showFormValidation silently skips when the element is absent', function () {
    document.getElementById('form-validation-message').remove();
    expect(function () {
      dashboard.showFormValidation(['Oops']);
    }).not.toThrow();
  });

  it('clearFormValidation silently skips when the element is absent', function () {
    document.getElementById('form-validation-message').remove();
    expect(function () {
      dashboard.clearFormValidation();
    }).not.toThrow();
  });
});

// ===========================================================================
// Status banners — unit tests
// ===========================================================================

describe('Status banners', function () {
  beforeEach(function () { buildDOM(); });

  it('showPersistenceError inserts a banner element with the error modifier class', function () {
    dashboard.showPersistenceError();
    var banner = document.querySelector('.status-banner.status-banner--error');
    expect(banner).not.toBeNull();
    expect(banner.textContent.length).toBeGreaterThan(0);
  });

  it('showLoadError inserts a banner element with the load-error modifier class', function () {
    dashboard.showLoadError();
    var banner = document.querySelector('.status-banner.status-banner--load-error');
    expect(banner).not.toBeNull();
    expect(banner.textContent.length).toBeGreaterThan(0);
  });

  it('showDeleteFailure inserts a banner element with the delete-failure modifier class', function () {
    dashboard.showDeleteFailure();
    var banner = document.querySelector('.status-banner.status-banner--delete-failure');
    expect(banner).not.toBeNull();
    expect(banner.textContent.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// handleFormSubmit with invalid input — unit test
// ===========================================================================

describe('handleFormSubmit — invalid input', function () {
  beforeEach(function () {
    buildDOM();
    dashboard.transactions = [];
  });

  it('does not change transactions and shows validation message on invalid input', function () {
    // Set invalid values.
    document.getElementById('item-name-input').value = '   ';
    document.getElementById('amount-input').value = 'notanumber';
    document.getElementById('category-select').value = 'Food';

    dashboard.handleFormSubmit(makeSubmitEvent());

    expect(dashboard.transactions.length).toBe(0);
    var messageElement = document.getElementById('form-validation-message');
    expect(messageElement.textContent.length).toBeGreaterThan(0);
  });

  it('does not change transactions when amount is empty', function () {
    document.getElementById('item-name-input').value = 'Valid Name';
    document.getElementById('amount-input').value = '';
    document.getElementById('category-select').value = 'Transport';

    dashboard.handleFormSubmit(makeSubmitEvent());

    expect(dashboard.transactions.length).toBe(0);
  });
});

// ===========================================================================
// handleFormSubmit with valid input — unit test
// ===========================================================================

describe('handleFormSubmit — valid input', function () {
  beforeEach(function () {
    buildDOM();
    dashboard.transactions = [];
    // Provide a minimal localStorage mock so saveTransactions does not throw.
    global.localStorage.clear();
  });

  it('adds the transaction and clears the form fields on valid input', function () {
    document.getElementById('item-name-input').value = '  Lunch  ';
    document.getElementById('amount-input').value = '12.50';
    document.getElementById('category-select').value = 'Food';

    dashboard.handleFormSubmit(makeSubmitEvent());

    expect(dashboard.transactions.length).toBe(1);
    var added = dashboard.transactions[0];
    expect(added.itemName).toBe('Lunch');
    expect(added.amount).toBe(12.50);
    expect(added.category).toBe('Food');
    expect(typeof added.id).toBe('string');
    expect(added.id.length).toBeGreaterThan(0);

    expect(document.getElementById('item-name-input').value).toBe('');
    expect(document.getElementById('amount-input').value).toBe('');
    expect(document.getElementById('category-select').selectedIndex).toBe(0);
  });
});

// ===========================================================================
// initDashboard — unit tests
// ===========================================================================

describe('initDashboard', function () {
  beforeEach(function () {
    buildDOM();
    dashboard.transactions = [];
    global.localStorage.clear();
  });

  it('populates transactions from localStorage and renders them', function () {
    var stored = JSON.stringify([
      { id: 'x1', itemName: 'Bus fare', amount: 2.50, category: 'Transport' },
      { id: 'x2', itemName: 'Pizza',    amount: 8.00, category: 'Food' },
    ]);
    global.localStorage.setItem('life-dashboard-transactions', stored);

    dashboard.initDashboard();

    expect(dashboard.transactions.length).toBe(2);
    var listContainer = document.getElementById('transaction-list');
    var rows = listContainer.querySelectorAll('.transaction-row');
    expect(rows.length).toBe(2);
  });

  it('starts with an empty set when localStorage has no stored transactions', function () {
    dashboard.initDashboard();

    expect(dashboard.transactions.length).toBe(0);
    var listContainer = document.getElementById('transaction-list');
    expect(listContainer.querySelector('.empty-state')).not.toBeNull();
  });

  it('shows showLoadError and starts empty when stored data is corrupt', function () {
    global.localStorage.setItem('life-dashboard-transactions', 'NOT VALID JSON{{');

    dashboard.initDashboard();

    expect(dashboard.transactions.length).toBe(0);
    var errorBanner = document.querySelector('.status-banner--load-error');
    expect(errorBanner).not.toBeNull();
  });
});

// ===========================================================================
// Property 12: form submit with valid input → transaction added, fields cleared
// Feature: todo-list-life-dashboard, Property 12
// Validates: Requirements 1.3, 1.6
// ===========================================================================

describe('Property 12: valid form submit grows transactions by 1 with correct fields and clears inputs', function () {
  it('holds for 100 generated valid input triples', function () {
    // Feature: todo-list-life-dashboard, Property 12: Valid submission creates a
    // matching transaction and clears all form fields.
    fc.assert(
      fc.property(validItemNameArb, validAmountArb, validCategoryArb, function (itemName, amountString, category) {
        buildDOM();
        dashboard.transactions = [];
        global.localStorage.clear();

        document.getElementById('item-name-input').value = itemName;
        document.getElementById('amount-input').value = amountString;
        document.getElementById('category-select').value = category;

        var countBefore = dashboard.transactions.length;
        dashboard.handleFormSubmit(makeSubmitEvent());
        var countAfter = dashboard.transactions.length;

        // (a) Transactions grew by exactly 1.
        expect(countAfter).toBe(countBefore + 1);

        // (b) The new entry has the correct field values.
        var added = dashboard.transactions[countAfter - 1];
        expect(added.itemName).toBe(itemName.trim());
        expect(added.amount).toBeCloseTo(parseFloat(amountString), 10);
        expect(added.category).toBe(category);

        // (c) Input fields are cleared after a successful submit.
        expect(document.getElementById('item-name-input').value).toBe('');
        expect(document.getElementById('amount-input').value).toBe('');
        expect(document.getElementById('category-select').selectedIndex).toBe(0);
      }),
      { numRuns: 100 }
    );
  });
});

// ===========================================================================
// Property 13: form submit with invalid input → state unchanged, validation shown
// Feature: todo-list-life-dashboard, Property 13
// Validates: Requirements 1.4, 1.5
// ===========================================================================

describe('Property 13: invalid form submit leaves transactions unchanged and shows a validation message', function () {
  it('holds for 100 generated invalid inputs (bad amounts)', function () {
    // Feature: todo-list-life-dashboard, Property 13: Invalid amount submissions
    // must not mutate state and must surface a validation message.
    fc.assert(
      fc.property(validItemNameArb, invalidAmountArb, validCategoryArb, function (itemName, badAmount, category) {
        buildDOM();
        // Seed some prior state so we confirm length does not change.
        dashboard.transactions = [
          { id: 'seed1', itemName: 'Seed', amount: 1.00, category: 'Fun' },
        ];
        global.localStorage.clear();

        document.getElementById('item-name-input').value = itemName;
        document.getElementById('amount-input').value = badAmount;
        document.getElementById('category-select').value = category;

        var countBefore = dashboard.transactions.length;
        dashboard.handleFormSubmit(makeSubmitEvent());

        // State must be unchanged.
        expect(dashboard.transactions.length).toBe(countBefore);

        // Validation message must be non-empty.
        var messageElement = document.getElementById('form-validation-message');
        expect(messageElement.textContent.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  it('holds for 100 generated invalid inputs (whitespace-only item names)', function () {
    // Feature: todo-list-life-dashboard, Property 13: Whitespace-only name submissions
    // must not mutate state and must surface a validation message.
    fc.assert(
      fc.property(whitespaceNameArb, validAmountArb, validCategoryArb, function (blankName, amount, category) {
        buildDOM();
        dashboard.transactions = [
          { id: 'seed2', itemName: 'Existing', amount: 5.00, category: 'Food' },
        ];
        global.localStorage.clear();

        document.getElementById('item-name-input').value = blankName;
        document.getElementById('amount-input').value = amount;
        document.getElementById('category-select').value = category;

        var countBefore = dashboard.transactions.length;
        dashboard.handleFormSubmit(makeSubmitEvent());

        expect(dashboard.transactions.length).toBe(countBefore);

        var messageElement = document.getElementById('form-validation-message');
        expect(messageElement.textContent.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });
});
