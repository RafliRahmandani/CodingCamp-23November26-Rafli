/*
 * tests/validation.test.js - unit and property-based tests for
 * validateTransactionInput (the pure validation function in js/dashboard.js).
 *
 * Covers Correctness Properties 1, 2, and 3 from the design document.
 * Run with: npx vitest --run
 */

const fc = require('fast-check');
const { validateTransactionInput } = require('../js/dashboard.js');

// ---------------------------------------------------------------------------
// Shared generators
// ---------------------------------------------------------------------------

// Formats a non-negative integer number of cents as a two-decimal dollar
// string (1 -> "0.01", 12345 -> "123.45", 99999999999 -> "999999999.99").
// Guarantees at most two decimal places and a value within 0.01..999999999.99.
function formatAmountFromCents(cents) {
  const dollars = Math.floor(cents / 100);
  const centsPart = cents % 100;
  const centsString = centsPart < 10 ? '0' + centsPart : String(centsPart);
  return dollars + '.' + centsString;
}

const validAmountArb = fc.integer({ min: 1, max: 99999999999 }).map(formatAmountFromCents);
const validCategoryArb = fc.constantFrom('Food', 'Transport', 'Fun');
const validItemNameArb = fc.integer({ min: 1, max: 100 }).map(length => 'a'.repeat(length));

// ---------------------------------------------------------------------------
// Unit / example tests
// ---------------------------------------------------------------------------

describe('validateTransactionInput - unit examples', () => {
  it('accepts a fully valid input', () => {
    const result = validateTransactionInput('Lunch', '12.5', 'Food');
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects a whitespace-only item name', () => {
    const result = validateTransactionInput('  ', '12.5', 'Food');
    expect(result.valid).toBe(false);
    expect(result.errors.some(message => /item name/i.test(message))).toBe(true);
  });

  it('rejects a non-numeric amount', () => {
    const result = validateTransactionInput('Lunch', 'abc', 'Food');
    expect(result.valid).toBe(false);
    expect(result.errors.some(message => /amount/i.test(message))).toBe(true);
  });

  it('rejects an amount with more than two decimal places', () => {
    const result = validateTransactionInput('Lunch', '0.001', 'Food');
    expect(result.valid).toBe(false);
    expect(result.errors.some(message => /amount/i.test(message))).toBe(true);
  });

  it('rejects a non-positive amount', () => {
    const result = validateTransactionInput('Lunch', '-5', 'Food');
    expect(result.valid).toBe(false);
    expect(result.errors.some(message => /amount/i.test(message))).toBe(true);
  });

  it('accepts the upper boundary amount 999999999.99', () => {
    const result = validateTransactionInput('Lunch', '999999999.99', 'Food');
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects an amount exceeding the maximum', () => {
    const result = validateTransactionInput('Lunch', '1000000000', 'Food');
    expect(result.valid).toBe(false);
    expect(result.errors.some(message => /amount/i.test(message))).toBe(true);
  });

  it('rejects an invalid category', () => {
    const result = validateTransactionInput('Lunch', '12.50', 'Bills');
    expect(result.valid).toBe(false);
    expect(result.errors.some(message => /category/i.test(message))).toBe(true);
  });

  it('rejects an item name whose raw length exceeds 100 characters', () => {
    const result = validateTransactionInput('a'.repeat(101), '12.50', 'Food');
    expect(result.valid).toBe(false);
    expect(result.errors.some(message => /item name/i.test(message))).toBe(true);
  });

  it('accepts the lower boundary amount 0.01', () => {
    const result = validateTransactionInput('Lunch', '0.01', 'Food');
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('accepts an item name with surrounding whitespace when raw length stays within 100', () => {
    const result = validateTransactionInput('  Lunch  ', '12.5', 'Food');
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects an amount of exactly zero (non-positive)', () => {
    const result = validateTransactionInput('Lunch', '0', 'Food');
    expect(result.valid).toBe(false);
    expect(result.errors.some(message => /amount/i.test(message))).toBe(true);
  });

  it('rejects scientific notation as non-numeric', () => {
    const result = validateTransactionInput('Lunch', '1e3', 'Food');
    expect(result.valid).toBe(false);
    expect(result.errors.some(message => /amount/i.test(message))).toBe(true);
  });

  it('rejects when every field is invalid and reports all three', () => {
    const result = validateTransactionInput('   ', 'abc', 'Bills');
    expect(result.valid).toBe(false);
    expect(result.errors.some(message => /item name/i.test(message))).toBe(true);
    expect(result.errors.some(message => /amount/i.test(message))).toBe(true);
    expect(result.errors.some(message => /category/i.test(message))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Property-based tests
// ---------------------------------------------------------------------------

describe('validateTransactionInput - property tests', () => {
  // Feature: todo-list-life-dashboard, Property 1: Valid submission creates a matching transaction
  // Validates: Requirements 1.3
  it('Property 1: every valid input triple is accepted with an empty errors array', () => {
    fc.assert(
      fc.property(validItemNameArb, validAmountArb, validCategoryArb, (itemName, amountString, category) => {
        const result = validateTransactionInput(itemName, amountString, category);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
      }),
      { numRuns: 100 }
    );
  });

  // Feature: todo-list-life-dashboard, Property 2: Whitespace-only or empty submissions are rejected
  // Validates: Requirements 1.4
  it('Property 2: whitespace-only or empty item names are rejected with an item-name error', () => {
    const whitespaceNameArb = fc
      .array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 0, maxLength: 50 })
      .map(characters => characters.join(''));
    fc.assert(
      fc.property(whitespaceNameArb, validAmountArb, validCategoryArb, (itemName, amountString, category) => {
        const result = validateTransactionInput(itemName, amountString, category);
        expect(result.valid).toBe(false);
        expect(result.errors.some(message => /item name/i.test(message))).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  // Feature: todo-list-life-dashboard, Property 3: Invalid amounts are rejected and valid boundaries are accepted
  // Validates: Requirements 1.5
  it('Property 3: every invalid amount string is rejected with an amount error', () => {
    const invalidAmountArb = fc.oneof(
      // Non-numeric / empty / whitespace-only.
      fc.constantFrom('abc', 'xyz', '1e3', 'NaN', 'twelve', '--5', '1.2.3', 'abc123', '', '   '),
      // Non-positive integers and zero.
      fc.integer({ min: -1000000, max: 0 }).map(value => String(value)),
      // Non-positive decimals.
      fc.constantFrom('-0.01', '-0.5', '-1.5', '-999.99', '-0', '-0.00', '0.0', '00'),
      // More than two decimal places.
      fc.tuple(fc.integer({ min: 0, max: 9999 }), fc.integer({ min: 3, max: 7 }))
        .map(([whole, decimals]) => whole + '.' + '7'.repeat(decimals)),
      // Exceeds the maximum.
      fc.integer({ min: 1000000001, max: 9999999999 }).map(value => value + '.99')
    );
    fc.assert(
      fc.property(invalidAmountArb, amountString => {
        const result = validateTransactionInput('Lunch', amountString, 'Food');
        expect(result.valid).toBe(false);
        expect(result.errors.some(message => /amount/i.test(message))).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  // Feature: todo-list-life-dashboard, Property 3: Invalid amounts are rejected and valid boundaries are accepted
  // Validates: Requirements 1.5
  it('Property 3 (boundaries): 0.01 and 999999999.99 are accepted', () => {
    expect(validateTransactionInput('Lunch', '0.01', 'Food').valid).toBe(true);
    expect(validateTransactionInput('Lunch', '999999999.99', 'Food').valid).toBe(true);
  });
});
