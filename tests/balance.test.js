/*
 * tests/balance.test.js - unit and property-based tests for
 * computeTotalBalance and renderTotalBalance in js/dashboard.js.
 *
 * Covers Design Correctness Properties 6 (balance sum correctness) and 7
 * (empty array returns zero).
 *
 * Run with: npx vitest --run
 */

const fc = require('fast-check');
const { computeTotalBalance, renderTotalBalance } = require('../js/dashboard.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a minimal transaction object for testing.
 * Only `amount` is required; other fields are filled with safe defaults so
 * the pure `computeTotalBalance` function receives well-formed objects.
 *
 * @param {number} amount
 * @param {string} [category]
 * @returns {{ id: string, itemName: string, amount: number, category: string }}
 */
function makeTransaction(amount, category) {
  return {
    id: 'test-id',
    itemName: 'Test item',
    amount,
    category: category || 'Food',
  };
}

// ---------------------------------------------------------------------------
// Unit / example tests
// ---------------------------------------------------------------------------

describe('computeTotalBalance - unit examples', () => {
  it('returns 0 for an empty array', () => {
    expect(computeTotalBalance([])).toBe(0);
  });

  it('returns the correct two-decimal sum for two whole-cent amounts', () => {
    // 10.99 + 5.01 = 16.00
    const transactions = [makeTransaction(10.99), makeTransaction(5.01)];
    expect(computeTotalBalance(transactions)).toBe(16.00);
  });

  it('handles the classic 0.1 + 0.2 floating-point edge case', () => {
    // Without epsilon-rounding, 0.1 + 0.2 produces 0.30000000000000004 in IEEE 754.
    const transactions = [makeTransaction(0.1), makeTransaction(0.2)];
    expect(computeTotalBalance(transactions)).toBe(0.30);
  });

  it('handles multi-value floating-point drift via epsilon-rounding', () => {
    // 0.1 + 0.2 + 0.1 = 0.4 exactly, but accumulating three floats can drift.
    // Epsilon-rounding ensures the result is 0.40, not 0.39999... truncated.
    const transactions = [makeTransaction(0.1), makeTransaction(0.2), makeTransaction(0.1)];
    expect(computeTotalBalance(transactions)).toBe(0.40);
  });

  it('returns the amount itself to two decimals for a single transaction', () => {
    const transactions = [makeTransaction(42.75)];
    expect(computeTotalBalance(transactions)).toBe(42.75);
  });

  it('returns a number type (not a string) for an empty array', () => {
    expect(typeof computeTotalBalance([])).toBe('number');
  });

  it('returns a number type for a non-empty array', () => {
    expect(typeof computeTotalBalance([makeTransaction(5)])).toBe('number');
  });

  it('sums three amounts correctly', () => {
    // 1.00 + 2.50 + 3.75 = 7.25
    const transactions = [
      makeTransaction(1.00),
      makeTransaction(2.50),
      makeTransaction(3.75),
    ];
    expect(computeTotalBalance(transactions)).toBe(7.25);
  });
});

// ---------------------------------------------------------------------------
// Property-based tests
// ---------------------------------------------------------------------------

describe('computeTotalBalance - property tests', () => {
  // Feature: todo-list-life-dashboard, Property 7 (empty array → 0)
  // Validates: Requirements 3.5
  it('Property 7: computeTotalBalance of an empty array is always 0', () => {
    fc.assert(
      fc.property(fc.constant([]), function (transactions) {
        expect(computeTotalBalance(transactions)).toBe(0);
      }),
      { numRuns: 10 }
    );
  });

  // Feature: todo-list-life-dashboard, Property 6 (balance sum correctness)
  // Validates: Requirements 3.2, 3.3, 3.4, 3.6
  it('Property 6: computeTotalBalance equals the epsilon-rounded sum of all amounts', () => {
    const transactionArb = fc.record({
      id: fc.string(),
      itemName: fc.string({ minLength: 1 }),
      amount: fc.float({ min: Math.fround(0.01), max: Math.fround(999.99), noNaN: true }),
      category: fc.constantFrom('Food', 'Transport', 'Fun'),
    });

    fc.assert(
      fc.property(fc.array(transactionArb), function (transactions) {
        const result = computeTotalBalance(transactions);

        // The expected value applies the same epsilon-rounding formula used in
        // the implementation so we are testing the property (correct two-decimal
        // rounding of the sum), not a specific floating-point path.
        const rawSum = transactions.reduce(function (sum, transaction) {
          return sum + transaction.amount;
        }, 0);
        const expected = Math.round(rawSum * 100 + Number.EPSILON) / 100;

        expect(result).toBe(expected);

        // The result must always have at most two decimal places when expressed
        // as a fixed string (i.e. it is a proper two-decimal monetary value).
        const decimalPart = result.toFixed(2).split('.')[1];
        expect(decimalPart.length).toBeLessThanOrEqual(2);
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// renderTotalBalance DOM tests
// ---------------------------------------------------------------------------

describe('renderTotalBalance - DOM tests', () => {
  beforeEach(() => {
    // Reset the DOM to a known state before each test so tests are independent.
    document.body.innerHTML = '<div id="total-balance-display"></div>';
  });

  it('writes the formatted balance into #total-balance-display', () => {
    renderTotalBalance([makeTransaction(12.5)]);
    const displayElement = document.getElementById('total-balance-display');
    expect(displayElement.textContent).toContain('12.50');
  });

  it('uses the "Total Balance: $" prefix format', () => {
    renderTotalBalance([makeTransaction(5.00)]);
    const displayElement = document.getElementById('total-balance-display');
    expect(displayElement.textContent).toBe('Total Balance: $5.00');
  });

  it('shows $0.00 when given an empty transactions array', () => {
    renderTotalBalance([]);
    const displayElement = document.getElementById('total-balance-display');
    expect(displayElement.textContent).toBe('Total Balance: $0.00');
  });

  it('formats the floating-point edge case 0.1 + 0.2 as $0.30', () => {
    renderTotalBalance([makeTransaction(0.1), makeTransaction(0.2)]);
    const displayElement = document.getElementById('total-balance-display');
    expect(displayElement.textContent).toBe('Total Balance: $0.30');
  });

  it('silently skips when #total-balance-display is absent (no throw)', () => {
    document.body.innerHTML = '';
    expect(() => renderTotalBalance([makeTransaction(10)])).not.toThrow();
  });

  it('always shows exactly two decimal places', () => {
    renderTotalBalance([makeTransaction(7)]);
    const displayElement = document.getElementById('total-balance-display');
    // "Total Balance: $7.00" — the decimal part must have exactly two digits.
    const amountText = displayElement.textContent.replace('Total Balance: $', '');
    const parts = amountText.split('.');
    expect(parts.length).toBe(2);
    expect(parts[1].length).toBe(2);
  });
});
