/*
 * tests/persistence.test.js - unit and property-based tests for the
 * persistence layer functions in js/dashboard.js.
 *
 * Covers Correctness Properties 9 and 10 (design.md) plus unit tests for the
 * save/load localStorage behaviors (Requirements 5.1, 5.3-5.8).
 * Run with: npx vitest --run
 */

const fc = require('fast-check');
const {
  serializeTransactions,
  deserializeTransactions,
  saveTransactions,
  loadTransactions,
} = require('../js/dashboard.js');

// ---------------------------------------------------------------------------
// Shared generators
// ---------------------------------------------------------------------------

/** Builds a valid transaction object with all required fields. */
const validTransactionArb = fc.record({
  id: fc.uuid(),
  itemName: fc.string({ minLength: 1, maxLength: 100 }).filter(name => name.trim().length > 0),
  amount: fc.float({ min: Math.fround(0.01), max: Math.fround(999999999.99), noNaN: true, noDefaultInfinity: true }).filter(n => n > 0 && Number.isFinite(n)),
  category: fc.constantFrom('Food', 'Transport', 'Fun'),
});

/** Builds arrays of zero or more valid transactions. */
const validTransactionArrayArb = fc.array(validTransactionArb, { minLength: 0, maxLength: 20 });

// ---------------------------------------------------------------------------
// Property-based tests
// ---------------------------------------------------------------------------

describe('Persistence — property-based tests', () => {
  // Feature: todo-list-life-dashboard, Property 4: Serialization round-trips with identical field values
  // Validates: Requirements 5.3, 5.4, 5.5
  it('Property 4: serialize→deserialize round-trip preserves the full array', () => {
    fc.assert(
      fc.property(validTransactionArrayArb, (transactions) => {
        const jsonString = serializeTransactions(transactions);
        const result = deserializeTransactions(jsonString);

        expect(result.ok).toBe(true);
        expect(result.error).toBeNull();
        expect(result.data).toHaveLength(transactions.length);

        // Every transaction must round-trip with identical field values.
        for (let index = 0; index < transactions.length; index++) {
          expect(result.data[index].id).toBe(transactions[index].id);
          expect(result.data[index].itemName).toBe(transactions[index].itemName);
          expect(result.data[index].amount).toBe(transactions[index].amount);
          expect(result.data[index].category).toBe(transactions[index].category);
        }
      }),
      { numRuns: 100 }
    );
  });

  // Feature: todo-list-life-dashboard, Property 5: Corrupt JSON is rejected by deserializeTransactions
  // Validates: Requirements 5.4
  it('Property 5: corrupt or structurally invalid input is always rejected', () => {
    // Builds inputs that cannot be valid: either non-JSON strings, JSON
    // primitives/objects (not arrays), or arrays with items missing required fields.
    const invalidInputArb = fc.oneof(
      // Non-JSON strings — these will fail JSON.parse.
      fc.string({ minLength: 1 }).filter(str => {
        try { JSON.parse(str); return false; } catch (_e) { return true; }
      }),
      // Valid JSON but not an array (string, number, boolean, object, null).
      fc.oneof(
        fc.string().map(str => JSON.stringify(str)),
        fc.integer().map(num => JSON.stringify(num)),
        fc.boolean().map(bool => JSON.stringify(bool)),
        fc.constant('null'),
        fc.record({ key: fc.string() }).map(obj => JSON.stringify(obj))
      ),
      // JSON arrays where every item is missing at least one required field.
      fc.array(
        fc.oneof(
          // Item with no fields at all.
          fc.constant({}),
          // Item missing 'id'.
          fc.record({ itemName: fc.constant('x'), amount: fc.constant(1), category: fc.constant('Food') }),
          // Item with empty 'id'.
          fc.record({ id: fc.constant(''), itemName: fc.constant('x'), amount: fc.constant(1), category: fc.constant('Food') }),
          // Item with zero amount.
          fc.record({ id: fc.constant('abc'), itemName: fc.constant('x'), amount: fc.constant(0), category: fc.constant('Food') }),
          // Item with invalid category.
          fc.record({ id: fc.constant('abc'), itemName: fc.constant('x'), amount: fc.constant(1), category: fc.constant('InvalidCategory') })
        ),
        { minLength: 1, maxLength: 5 }
      ).map(arr => JSON.stringify(arr))
    );

    fc.assert(
      fc.property(invalidInputArb, (input) => {
        const result = deserializeTransactions(input);
        expect(result.ok).toBe(false);
        expect(result.data).toBeNull();
        expect(typeof result.error).toBe('string');
        expect(result.error.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Unit tests — saveTransactions / loadTransactions (uses jsdom localStorage)
// ---------------------------------------------------------------------------

describe('Persistence — unit tests (localStorage)', () => {
  const STORAGE_KEY = 'life-dashboard-transactions';

  const sampleTransactions = [
    { id: 'id-001', itemName: 'Lunch', amount: 12.50, category: 'Food' },
    { id: 'id-002', itemName: 'Bus fare', amount: 3.00, category: 'Transport' },
  ];

  beforeEach(() => {
    // Start each test with a clean localStorage and restore any spies.
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('save and load round-trip: loaded data matches saved data', () => {
    const saveResult = saveTransactions(sampleTransactions);
    expect(saveResult).toBe(true);

    const { transactions, loadError } = loadTransactions();
    expect(loadError).toBe(false);
    expect(transactions).toHaveLength(sampleTransactions.length);

    for (let index = 0; index < sampleTransactions.length; index++) {
      expect(transactions[index].id).toBe(sampleTransactions[index].id);
      expect(transactions[index].itemName).toBe(sampleTransactions[index].itemName);
      expect(transactions[index].amount).toBe(sampleTransactions[index].amount);
      expect(transactions[index].category).toBe(sampleTransactions[index].category);
    }
  });

  it('absent key: loadTransactions returns empty array with loadError false', () => {
    // localStorage is already clear from beforeEach.
    const { transactions, loadError } = loadTransactions();
    expect(transactions).toEqual([]);
    expect(loadError).toBe(false);
  });

  it('corrupt stored value: loadTransactions returns empty array with loadError true', () => {
    localStorage.setItem(STORAGE_KEY, 'not-valid-json');
    const { transactions, loadError } = loadTransactions();
    expect(transactions).toEqual([]);
    expect(loadError).toBe(true);
  });

  it('structurally invalid JSON array: loadTransactions returns loadError true', () => {
    // Valid JSON array but items fail structural validation.
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{ id: '', amount: -1 }]));
    const { transactions, loadError } = loadTransactions();
    expect(transactions).toEqual([]);
    expect(loadError).toBe(true);
  });

  it('saveTransactions returns false without throwing when localStorage.setItem throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });

    let saveResult;
    expect(() => {
      saveResult = saveTransactions(sampleTransactions);
    }).not.toThrow();

    expect(saveResult).toBe(false);
  });

  it('saveTransactions writes to the correct storage key', () => {
    saveTransactions(sampleTransactions);
    const rawValue = localStorage.getItem(STORAGE_KEY);
    expect(rawValue).not.toBeNull();
    const parsed = JSON.parse(rawValue);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(sampleTransactions.length);
  });

  it('saving an empty array then loading returns an empty array with no error', () => {
    saveTransactions([]);
    const { transactions, loadError } = loadTransactions();
    expect(transactions).toEqual([]);
    expect(loadError).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unit tests — serializeTransactions / deserializeTransactions (pure)
// ---------------------------------------------------------------------------

describe('serializeTransactions — unit examples', () => {
  it('returns a JSON string of the input array', () => {
    const transactions = [{ id: 'abc', itemName: 'Coffee', amount: 4.5, category: 'Food' }];
    const result = serializeTransactions(transactions);
    expect(typeof result).toBe('string');
    expect(JSON.parse(result)).toEqual(transactions);
  });

  it('serializes an empty array to "[]"', () => {
    expect(serializeTransactions([])).toBe('[]');
  });
});

describe('deserializeTransactions — unit examples', () => {
  it('accepts a valid single-item array', () => {
    const input = JSON.stringify([{ id: 'abc', itemName: 'Coffee', amount: 4.5, category: 'Food' }]);
    const result = deserializeTransactions(input);
    expect(result.ok).toBe(true);
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1);
  });

  it('accepts an empty array', () => {
    const result = deserializeTransactions('[]');
    expect(result.ok).toBe(true);
    expect(result.data).toEqual([]);
  });

  it('rejects non-JSON input with a parse error message', () => {
    const result = deserializeTransactions('{not json}');
    expect(result.ok).toBe(false);
    expect(result.data).toBeNull();
    expect(result.error).toMatch(/^Parse error:/);
  });

  it('rejects a JSON object (not an array)', () => {
    const result = deserializeTransactions('{"id":"abc"}');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Expected array');
  });

  it('rejects an item with a missing id', () => {
    const input = JSON.stringify([{ itemName: 'x', amount: 1, category: 'Food' }]);
    const result = deserializeTransactions(input);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/index 0/);
  });

  it('rejects an item with an empty id', () => {
    const input = JSON.stringify([{ id: '', itemName: 'x', amount: 1, category: 'Food' }]);
    const result = deserializeTransactions(input);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/index 0/);
  });

  it('rejects an item with a zero amount', () => {
    const input = JSON.stringify([{ id: 'x', itemName: 'x', amount: 0, category: 'Food' }]);
    const result = deserializeTransactions(input);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/amount/);
  });

  it('rejects an item with a negative amount', () => {
    const input = JSON.stringify([{ id: 'x', itemName: 'x', amount: -5, category: 'Food' }]);
    const result = deserializeTransactions(input);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/amount/);
  });

  it('rejects an item with an invalid category', () => {
    const input = JSON.stringify([{ id: 'x', itemName: 'x', amount: 1, category: 'Bills' }]);
    const result = deserializeTransactions(input);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/category/);
  });

  it('rejects an item with an itemName exceeding 100 characters', () => {
    const input = JSON.stringify([{ id: 'x', itemName: 'a'.repeat(101), amount: 1, category: 'Food' }]);
    const result = deserializeTransactions(input);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/itemName/);
  });

  it('reports the correct index when only the second item is invalid', () => {
    const input = JSON.stringify([
      { id: 'x', itemName: 'valid', amount: 1, category: 'Food' },
      { id: 'y', itemName: 'valid', amount: -1, category: 'Food' },
    ]);
    const result = deserializeTransactions(input);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/index 1/);
  });
});
