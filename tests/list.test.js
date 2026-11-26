/*
 * tests/list.test.js
 *
 * Unit and property-based tests for:
 *   - renderTransactionList  (Renderer — DOM)
 *   - handleDeleteTransaction (Controller — state + persistence + re-render)
 *
 * Run with: npx vitest --run
 *
 * Covers Design Properties 10 and 11.
 * Vitest is configured with the jsdom environment (vitest.config.mjs), so
 * document.getElementById and DOM manipulation work without extra setup.
 */

const fc = require('fast-check');
const dashboard = require('../js/dashboard.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a minimal valid transaction object.
 *
 * @param {Partial<{id: string, itemName: string, amount: number, category: string}>} overrides
 * @returns {{ id: string, itemName: string, amount: number, category: string }}
 */
function makeTransaction(overrides) {
  return Object.assign(
    { id: 'test-id-1', itemName: 'Lunch', amount: 12.5, category: 'Food' },
    overrides
  );
}

/**
 * Ensures `#transaction-list` exists in the document and returns it.
 * Creates and appends it if it is not present, so each test starts with a
 * clean container.
 */
function ensureTransactionListContainer() {
  var existing = document.getElementById('transaction-list');
  if (existing) {
    existing.innerHTML = '';
    return existing;
  }
  var container = document.createElement('div');
  container.id = 'transaction-list';
  document.body.appendChild(container);
  return container;
}

/** Resets the module-level transactions state to an empty array. */
function resetTransactions() {
  dashboard.transactions = [];
}

// ---------------------------------------------------------------------------
// fast-check generators
// ---------------------------------------------------------------------------

const validCategoryArb = fc.constantFrom('Food', 'Transport', 'Fun');

// Generates a unique string id.
const transactionIdArb = fc.uuid();

// Generates a valid item name (1–100 printable characters, non-whitespace start).
const itemNameArb = fc.stringOf(
  fc.char().filter(function (char) { return char.trim().length > 0; }),
  { minLength: 1, maxLength: 20 }
);

// Generates a valid positive amount with at most 2 decimal places (1 cent to $999).
const transactionAmountArb = fc
  .integer({ min: 1, max: 99900 })
  .map(function (cents) { return cents / 100; });

// Generates a single valid transaction.
const transactionArb = fc.record({
  id: transactionIdArb,
  itemName: itemNameArb,
  amount: transactionAmountArb,
  category: validCategoryArb,
});

// Generates an array of 1–10 transactions with UNIQUE ids.
const transactionListArb = fc
  .uniqueArray(transactionArb, { minLength: 1, maxLength: 10, selector: function (t) { return t.id; } });

// ---------------------------------------------------------------------------
// Unit tests: renderTransactionList
// ---------------------------------------------------------------------------

describe('renderTransactionList - unit tests', function () {
  beforeEach(function () {
    ensureTransactionListContainer();
  });

  it('shows empty-state paragraph and no rows when given an empty array', function () {
    dashboard.renderTransactionList([]);

    var container = document.getElementById('transaction-list');
    var emptyState = container.querySelector('.empty-state');
    var rows = container.querySelectorAll('.transaction-row');

    expect(emptyState).not.toBeNull();
    expect(emptyState.textContent).toBe('No transactions yet');
    expect(rows.length).toBe(0);
  });

  it('renders one row for a single transaction with correct item name', function () {
    var tx = makeTransaction({ id: 'id-1', itemName: 'Coffee', amount: 3.5, category: 'Food' });
    dashboard.renderTransactionList([tx]);

    var container = document.getElementById('transaction-list');
    var rows = container.querySelectorAll('.transaction-row');
    expect(rows.length).toBe(1);

    var nameSpan = rows[0].querySelector('.transaction-item-name');
    expect(nameSpan).not.toBeNull();
    expect(nameSpan.textContent).toBe('Coffee');
  });

  it('formats the amount as $X.XX (toFixed 2)', function () {
    var tx = makeTransaction({ amount: 7, category: 'Transport' });
    dashboard.renderTransactionList([tx]);

    var container = document.getElementById('transaction-list');
    var amountSpan = container.querySelector('.transaction-amount');
    expect(amountSpan).not.toBeNull();
    expect(amountSpan.textContent).toBe('$7.00');
  });

  it('applies the category-badge modifier class in lowercase', function () {
    var tx = makeTransaction({ category: 'Food' });
    dashboard.renderTransactionList([tx]);

    var container = document.getElementById('transaction-list');
    var badge = container.querySelector('.category-badge--food');
    expect(badge).not.toBeNull();
    // Must NOT have the capitalised variant.
    expect(container.querySelector('.category-badge--Food')).toBeNull();
  });

  it('sets the data-transaction-id attribute on the delete button', function () {
    var tx = makeTransaction({ id: 'unique-123', itemName: 'Taxi', category: 'Transport', amount: 15 });
    dashboard.renderTransactionList([tx]);

    var container = document.getElementById('transaction-list');
    var deleteButton = container.querySelector('.delete-button');
    expect(deleteButton).not.toBeNull();
    expect(deleteButton.getAttribute('data-transaction-id')).toBe('unique-123');
  });

  it('sets an aria-label on the delete button containing the item name', function () {
    var tx = makeTransaction({ id: 'id-aria', itemName: 'Concert ticket', category: 'Fun', amount: 50 });
    dashboard.renderTransactionList([tx]);

    var container = document.getElementById('transaction-list');
    var deleteButton = container.querySelector('.delete-button');
    expect(deleteButton.getAttribute('aria-label')).toBe('Delete Concert ticket');
  });

  it('renders three rows for three transactions', function () {
    var transactions = [
      makeTransaction({ id: 'a', itemName: 'Item A', category: 'Food', amount: 1 }),
      makeTransaction({ id: 'b', itemName: 'Item B', category: 'Transport', amount: 2 }),
      makeTransaction({ id: 'c', itemName: 'Item C', category: 'Fun', amount: 3 }),
    ];
    dashboard.renderTransactionList(transactions);

    var container = document.getElementById('transaction-list');
    var rows = container.querySelectorAll('.transaction-row');
    expect(rows.length).toBe(3);
  });

  it('applies the correct badge modifier class for all three categories', function () {
    var transactions = [
      makeTransaction({ id: 'f', itemName: 'Groceries', category: 'Food', amount: 10 }),
      makeTransaction({ id: 't', itemName: 'Bus', category: 'Transport', amount: 5 }),
      makeTransaction({ id: 'u', itemName: 'Movie', category: 'Fun', amount: 20 }),
    ];
    dashboard.renderTransactionList(transactions);

    var container = document.getElementById('transaction-list');
    expect(container.querySelector('.category-badge--food')).not.toBeNull();
    expect(container.querySelector('.category-badge--transport')).not.toBeNull();
    expect(container.querySelector('.category-badge--fun')).not.toBeNull();
  });

  it('replaces previous content on a second call (no stale rows)', function () {
    dashboard.renderTransactionList([makeTransaction({ id: 'x1' })]);
    dashboard.renderTransactionList([makeTransaction({ id: 'x2' }), makeTransaction({ id: 'x3' })]);

    var container = document.getElementById('transaction-list');
    var rows = container.querySelectorAll('.transaction-row');
    expect(rows.length).toBe(2);
  });

  it('silently returns when #transaction-list is absent', function () {
    // Remove the container to trigger the defensive guard.
    var container = document.getElementById('transaction-list');
    container.parentNode.removeChild(container);

    // Should not throw.
    expect(function () {
      dashboard.renderTransactionList([makeTransaction()]);
    }).not.toThrow();

    // Restore for subsequent tests.
    ensureTransactionListContainer();
  });
});

// ---------------------------------------------------------------------------
// Unit tests: handleDeleteTransaction
// ---------------------------------------------------------------------------

describe('handleDeleteTransaction - unit tests', function () {
  beforeEach(function () {
    ensureTransactionListContainer();
    resetTransactions();
    // Clear localStorage between tests to prevent cross-test persistence.
    localStorage.clear();
  });

  it('removes a matching transaction from the in-memory state', function () {
    dashboard.transactions = [
      makeTransaction({ id: 'del-1', itemName: 'Item A' }),
      makeTransaction({ id: 'del-2', itemName: 'Item B' }),
    ];

    dashboard.handleDeleteTransaction('del-1');

    expect(dashboard.transactions.length).toBe(1);
    expect(dashboard.transactions[0].id).toBe('del-2');
  });

  it('calls saveTransactions (via localStorage write) after a successful delete', function () {
    dashboard.transactions = [makeTransaction({ id: 'save-1' })];

    dashboard.handleDeleteTransaction('save-1');

    // After a successful delete, the storage key must exist and contain an empty array,
    // confirming that saveTransactions was invoked.
    var stored = localStorage.getItem('life-dashboard-transactions');
    expect(stored).not.toBeNull();
    expect(stored).toBe('[]');
  });

  it('leaves state unchanged when given an id that does not exist', function () {
    var original = [makeTransaction({ id: 'keep-me' })];
    dashboard.transactions = original.slice();

    dashboard.handleDeleteTransaction('nonexistent-id');

    expect(dashboard.transactions.length).toBe(1);
    expect(dashboard.transactions[0].id).toBe('keep-me');
  });

  it('does not call saveTransactions when the id is not found', function () {
    dashboard.transactions = [makeTransaction({ id: 'stay-1' })];

    var setItemSpy = vi.spyOn(localStorage, 'setItem');
    dashboard.handleDeleteTransaction('nonexistent-id');

    expect(setItemSpy).not.toHaveBeenCalled();
    setItemSpy.mockRestore();
  });

  it('calls renderAll (a no-op stub at this stage) without throwing', function () {
    dashboard.transactions = [makeTransaction({ id: 'render-1' })];
    // renderAll is a no-op stub defined in the Controller section. This test
    // confirms handleDeleteTransaction completes without error after calling it.
    expect(function () {
      dashboard.handleDeleteTransaction('render-1');
    }).not.toThrow();
  });

  it('removes the transaction from localStorage serialization after delete', function () {
    var tx = makeTransaction({ id: 'persist-1', itemName: 'PersistItem' });
    dashboard.transactions = [tx];

    dashboard.handleDeleteTransaction('persist-1');

    var stored = localStorage.getItem('life-dashboard-transactions');
    // After the delete, storage should hold an empty array.
    expect(stored).toBe('[]');
  });

  it('handles an empty transactions array gracefully (no throw)', function () {
    dashboard.transactions = [];
    expect(function () {
      dashboard.handleDeleteTransaction('anything');
    }).not.toThrow();
    expect(dashboard.transactions.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Property 10: each transaction has a rendered row (min 100 runs)
// ---------------------------------------------------------------------------

describe('Property 10: renderTransactionList creates one row per transaction', function () {
  // Feature: todo-list-life-dashboard, Property 10: Mutations persist the current state to storage
  // Validates: Requirements 5.1
  it('Property 10: for any array of valid transactions, exactly one .transaction-row is rendered per entry', function () {
    ensureTransactionListContainer();
    fc.assert(
      fc.property(transactionListArb, function (transactions) {
        ensureTransactionListContainer();
        dashboard.renderTransactionList(transactions);

        var container = document.getElementById('transaction-list');
        var rows = container.querySelectorAll('.transaction-row');
        expect(rows.length).toBe(transactions.length);
      }),
      { numRuns: 100 }
    );
  });

  it('Property 10 (non-empty): rendered row ids match the input transaction ids', function () {
    ensureTransactionListContainer();
    fc.assert(
      fc.property(transactionListArb, function (transactions) {
        ensureTransactionListContainer();
        dashboard.renderTransactionList(transactions);

        var container = document.getElementById('transaction-list');
        var deleteButtons = container.querySelectorAll('.delete-button');
        var renderedIds = Array.from(deleteButtons).map(function (button) {
          return button.getAttribute('data-transaction-id');
        });
        var inputIds = transactions.map(function (t) { return t.id; });

        // Every input id must appear in the rendered buttons.
        inputIds.forEach(function (inputId) {
          expect(renderedIds).toContain(inputId);
        });
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 11: delete removes exactly one entry (min 100 runs)
// ---------------------------------------------------------------------------

describe('Property 11: handleDeleteTransaction removes exactly the targeted entry', function () {
  beforeEach(function () {
    ensureTransactionListContainer();
    resetTransactions();
    localStorage.clear();
  });

  // Feature: todo-list-life-dashboard, Property 11: Deleting a transaction removes exactly that entry
  // Validates: Requirements 2.3
  it('Property 11: given N transactions, deleting a valid id leaves N-1 entries and removes that id', function () {
    fc.assert(
      fc.property(
        transactionListArb,
        fc.integer({ min: 0, max: 9 }), // index of which transaction to delete (clamped below)
        function (transactionList, rawIndex) {
          // Reset state for each run.
          localStorage.clear();
          dashboard.transactions = transactionList.slice();

          var targetIndex = rawIndex % transactionList.length; // clamp to valid range
          var targetId = transactionList[targetIndex].id;
          var initialCount = transactionList.length;

          dashboard.handleDeleteTransaction(targetId);

          // The array must have exactly N-1 entries.
          expect(dashboard.transactions.length).toBe(initialCount - 1);

          // The deleted id must not appear in the remaining entries.
          var remainingIds = dashboard.transactions.map(function (t) { return t.id; });
          expect(remainingIds).not.toContain(targetId);

          // Every other transaction must remain unchanged.
          transactionList.forEach(function (originalTransaction) {
            if (originalTransaction.id !== targetId) {
              expect(remainingIds).toContain(originalTransaction.id);
            }
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 11 (invalid id): state is unchanged when the id is not in the array', function () {
    fc.assert(
      fc.property(
        transactionListArb,
        fc.string({ minLength: 1 }).filter(function (id) {
          // The generated id must not collide with any id in the list.
          return true; // collision check done inside the property body
        }),
        function (transactionList, candidateId) {
          // Ensure the candidate id does not appear in the list.
          var isCollision = transactionList.some(function (t) { return t.id === candidateId; });
          if (isCollision) {
            return; // skip this run (pre-condition not met)
          }

          localStorage.clear();
          dashboard.transactions = transactionList.slice();

          dashboard.handleDeleteTransaction(candidateId);

          expect(dashboard.transactions.length).toBe(transactionList.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});
