/*
 * tests/chart.test.js - unit and property-based tests for the pie chart
 * functions in js/dashboard.js: aggregateByCategory, computeSegmentAngles,
 * describeArc, and renderChart.
 *
 * Covers Design Correctness Properties 8 and 9 (chart) from the design doc.
 * Run with: npx vitest --run
 */

const fc = require('fast-check');
const {
  aggregateByCategory,
  computeSegmentAngles,
  describeArc,
  renderChart,
} = require('../js/dashboard.js');

// ---------------------------------------------------------------------------
// Shared generators
// ---------------------------------------------------------------------------

/** Categories in the domain. */
const VALID_CATEGORIES = ['Food', 'Transport', 'Fun'];

/** Arbitrary valid amount: a positive number with at most 2 decimal places. */
const validAmountArb = fc
  .integer({ min: 1, max: 99999999999 })
  .map(function (cents) {
    const dollars = Math.floor(cents / 100);
    const centsPart = cents % 100;
    const centsString = centsPart < 10 ? '0' + centsPart : String(centsPart);
    return parseFloat(dollars + '.' + centsString);
  });

/** Arbitrary transaction with a valid amount and category. */
const transactionArb = fc.record({
  id: fc.uuid(),
  itemName: fc.string({ minLength: 1, maxLength: 20 }),
  amount: validAmountArb,
  category: fc.constantFrom(...VALID_CATEGORIES),
});

/** At least one transaction (minimum length 1). */
const nonEmptyTransactionsArb = fc.array(transactionArb, { minLength: 1, maxLength: 20 });

/** Transactions all belonging to a single chosen category. */
const singleCategoryTransactionsArb = fc
  .constantFrom(...VALID_CATEGORIES)
  .chain(function (category) {
    return fc.array(
      fc.record({
        id: fc.uuid(),
        itemName: fc.string({ minLength: 1, maxLength: 20 }),
        amount: validAmountArb,
        category: fc.constant(category),
      }),
      { minLength: 1, maxLength: 20 }
    );
  });

// ---------------------------------------------------------------------------
// aggregateByCategory — unit examples
// ---------------------------------------------------------------------------

describe('aggregateByCategory - unit examples', () => {
  it('returns zero for all categories when given an empty array', () => {
    const result = aggregateByCategory([]);
    expect(result).toEqual({ Food: 0, Transport: 0, Fun: 0 });
  });

  it('sums amounts for mixed categories correctly', () => {
    const transactions = [
      { id: '1', itemName: 'Lunch', amount: 10, category: 'Food' },
      { id: '2', itemName: 'Bus', amount: 3.5, category: 'Transport' },
      { id: '3', itemName: 'Dinner', amount: 20, category: 'Food' },
      { id: '4', itemName: 'Cinema', amount: 15, category: 'Fun' },
    ];
    const result = aggregateByCategory(transactions);
    expect(result.Food).toBe(30);
    expect(result.Transport).toBe(3.5);
    expect(result.Fun).toBe(15);
  });

  it('places the entire sum under the matching category when all transactions share one category', () => {
    const transactions = [
      { id: '1', itemName: 'Pizza', amount: 12.5, category: 'Food' },
      { id: '2', itemName: 'Salad', amount: 7.5, category: 'Food' },
    ];
    const result = aggregateByCategory(transactions);
    expect(result.Food).toBe(20);
    expect(result.Transport).toBe(0);
    expect(result.Fun).toBe(0);
  });

  it('rounds floating-point sums to two decimal places', () => {
    // 0.1 + 0.2 = 0.30000...4 without rounding — must be 0.30
    const transactions = [
      { id: '1', itemName: 'Coffee', amount: 0.1, category: 'Food' },
      { id: '2', itemName: 'Snack', amount: 0.2, category: 'Food' },
    ];
    const result = aggregateByCategory(transactions);
    expect(result.Food).toBe(0.3);
  });
});

// ---------------------------------------------------------------------------
// computeSegmentAngles — unit examples
// ---------------------------------------------------------------------------

describe('computeSegmentAngles - unit examples', () => {
  it('returns two segments each spanning 180° when two categories have equal totals', () => {
    const totals = { Food: 50, Transport: 50, Fun: 0 };
    const segments = computeSegmentAngles(totals, 100);
    expect(segments).toHaveLength(2);
    expect(segments[0].endAngle - segments[0].startAngle).toBeCloseTo(180, 10);
    expect(segments[1].endAngle - segments[1].startAngle).toBeCloseTo(180, 10);
  });

  it('returns three segments each spanning 120° when all categories have equal totals', () => {
    const totals = { Food: 100, Transport: 100, Fun: 100 };
    const segments = computeSegmentAngles(totals, 300);
    expect(segments).toHaveLength(3);
    segments.forEach(function (segment) {
      expect(segment.endAngle - segment.startAngle).toBeCloseTo(120, 10);
    });
  });

  it('skips categories with zero total', () => {
    const totals = { Food: 100, Transport: 0, Fun: 0 };
    const segments = computeSegmentAngles(totals, 100);
    expect(segments).toHaveLength(1);
    expect(segments[0].category).toBe('Food');
  });

  it('assigns the correct fixed color to each category', () => {
    const totals = { Food: 60, Transport: 40, Fun: 0 };
    const segments = computeSegmentAngles(totals, 100);
    const foodSegment = segments.find(function (s) { return s.category === 'Food'; });
    const transportSegment = segments.find(function (s) { return s.category === 'Transport'; });
    expect(foodSegment.color).toBe('#ea580c');
    expect(transportSegment.color).toBe('#059669');
  });

  it('the first segment starts at 0°', () => {
    const totals = { Food: 50, Transport: 50, Fun: 0 };
    const segments = computeSegmentAngles(totals, 100);
    expect(segments[0].startAngle).toBe(0);
  });

  it('each segment startAngle equals the previous endAngle', () => {
    const totals = { Food: 100, Transport: 100, Fun: 100 };
    const segments = computeSegmentAngles(totals, 300);
    for (let index = 1; index < segments.length; index++) {
      expect(segments[index].startAngle).toBeCloseTo(segments[index - 1].endAngle, 10);
    }
  });
});

// ---------------------------------------------------------------------------
// describeArc — unit examples
// ---------------------------------------------------------------------------

describe('describeArc - unit examples', () => {
  it('returns a string', () => {
    const result = describeArc(100, 100, 80, 0, 90);
    expect(typeof result).toBe('string');
  });

  it('contains the arc command "A" for a partial arc', () => {
    const result = describeArc(100, 100, 80, 0, 90);
    expect(result).toContain('A');
  });

  it('produces a valid path for a full circle (360°)', () => {
    const result = describeArc(100, 100, 80, 0, 360);
    // Full circle uses two arcs — expect two "A" commands
    const arcCount = (result.match(/A/g) || []).length;
    expect(arcCount).toBe(2);
  });

  it('uses largeArcFlag=1 for arcs spanning more than 180°', () => {
    const result = describeArc(100, 100, 80, 0, 270);
    // The flag appears as "0 1 1" (largeArcFlag=1, sweepFlag=1)
    expect(result).toContain(' 1 1 ');
  });

  it('uses largeArcFlag=0 for arcs spanning 180° or less', () => {
    const result = describeArc(100, 100, 80, 0, 90);
    // The flag appears as "0 0 1" (largeArcFlag=0, sweepFlag=1)
    expect(result).toContain(' 0 1 ');
  });

  it('starts the path at the center (M cx cy)', () => {
    const result = describeArc(100, 100, 80, 0, 90);
    expect(result.startsWith('M 100 100')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// renderChart — DOM tests (jsdom)
// ---------------------------------------------------------------------------

describe('renderChart - DOM tests', () => {
  beforeEach(function () {
    // Reset the DOM chart container before each test.
    document.body.innerHTML = '<div id="visual-chart"></div>';
  });

  it('shows the empty-state paragraph when given an empty transactions array', () => {
    renderChart([]);
    const container = document.getElementById('visual-chart');
    const emptyElement = container.querySelector('.empty-state');
    expect(emptyElement).not.toBeNull();
    expect(emptyElement.textContent).toBe('No spending data is available');
  });

  it('shows the empty-state paragraph when grandTotal is 0 (zero-amount transactions)', () => {
    // amount must be > 0 by validation, but protect renderChart defensively
    renderChart([{ id: '1', itemName: 'Free', amount: 0, category: 'Food' }]);
    const container = document.getElementById('visual-chart');
    const emptyElement = container.querySelector('.empty-state');
    expect(emptyElement).not.toBeNull();
  });

  it('renders an SVG element when transactions are non-empty', () => {
    renderChart([{ id: '1', itemName: 'Lunch', amount: 10, category: 'Food' }]);
    const container = document.getElementById('visual-chart');
    const svgElement = container.querySelector('svg');
    expect(svgElement).not.toBeNull();
  });

  it('renders one <path> per category with nonzero total', () => {
    const transactions = [
      { id: '1', itemName: 'Lunch', amount: 10, category: 'Food' },
      { id: '2', itemName: 'Bus', amount: 5, category: 'Transport' },
    ];
    renderChart(transactions);
    const container = document.getElementById('visual-chart');
    const pathElements = container.querySelectorAll('path');
    // Two distinct categories: Food and Transport
    expect(pathElements.length).toBe(2);
  });

  it('renders three <path> elements when all three categories have spending', () => {
    const transactions = [
      { id: '1', itemName: 'Lunch', amount: 10, category: 'Food' },
      { id: '2', itemName: 'Bus', amount: 5, category: 'Transport' },
      { id: '3', itemName: 'Movie', amount: 8, category: 'Fun' },
    ];
    renderChart(transactions);
    const container = document.getElementById('visual-chart');
    const pathElements = container.querySelectorAll('path');
    expect(pathElements.length).toBe(3);
  });

  it('renders one <path> when only one category has spending', () => {
    const transactions = [
      { id: '1', itemName: 'Pizza', amount: 12, category: 'Food' },
      { id: '2', itemName: 'Salad', amount: 8, category: 'Food' },
    ];
    renderChart(transactions);
    const container = document.getElementById('visual-chart');
    const pathElements = container.querySelectorAll('path');
    expect(pathElements.length).toBe(1);
  });

  it('sets the fill attribute on each path to the correct category color', () => {
    const transactions = [
      { id: '1', itemName: 'Lunch', amount: 10, category: 'Food' },
    ];
    renderChart(transactions);
    const container = document.getElementById('visual-chart');
    const pathElement = container.querySelector('path');
    expect(pathElement.getAttribute('fill')).toBe('#ea580c');
  });

  it('sets an aria-label on the SVG element', () => {
    renderChart([{ id: '1', itemName: 'Lunch', amount: 10, category: 'Food' }]);
    const svgElement = document.getElementById('visual-chart').querySelector('svg');
    expect(svgElement.getAttribute('aria-label')).toBeTruthy();
  });

  it('silently skips rendering when #visual-chart element is absent', () => {
    document.body.innerHTML = '';
    expect(function () {
      renderChart([{ id: '1', itemName: 'Lunch', amount: 10, category: 'Food' }]);
    }).not.toThrow();
  });

  it('clears previous content and re-renders on a second call', () => {
    const transactions = [
      { id: '1', itemName: 'Lunch', amount: 10, category: 'Food' },
    ];
    renderChart(transactions);
    renderChart([]);
    const container = document.getElementById('visual-chart');
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('.empty-state')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Property-based tests
// ---------------------------------------------------------------------------

describe('Chart functions - property tests', () => {
  // Feature: todo-list-life-dashboard, Property 8: segment angles sum to 360
  // Validates: Requirements 4.1, 4.2
  it('Property 8: segment (endAngle - startAngle) values sum to exactly 360° for any set with nonzero total', () => {
    fc.assert(
      fc.property(nonEmptyTransactionsArb, function (transactions) {
        const categoryTotals = aggregateByCategory(transactions);
        const grandTotal = categoryTotals.Food + categoryTotals.Transport + categoryTotals.Fun;
        // Skip generated sets where every transaction rounds to 0 (edge case
        // theoretically impossible with min amount 0.01, but guard anyway).
        if (grandTotal === 0) {
          return true;
        }
        const segments = computeSegmentAngles(categoryTotals, grandTotal);
        const totalDegrees = segments.reduce(function (sum, segment) {
          return sum + (segment.endAngle - segment.startAngle);
        }, 0);
        expect(totalDegrees).toBeCloseTo(360, 10);
        return true;
      }),
      { numRuns: 100 }
    );
  });

  // Feature: todo-list-life-dashboard, Property 9: single-category fills whole circle
  // Validates: Requirements 4.1, 4.2
  it('Property 9: when all transactions are in one category, exactly one segment spanning ~360° is returned', () => {
    fc.assert(
      fc.property(singleCategoryTransactionsArb, function (transactions) {
        const categoryTotals = aggregateByCategory(transactions);
        const grandTotal = categoryTotals.Food + categoryTotals.Transport + categoryTotals.Fun;
        if (grandTotal === 0) {
          return true;
        }
        const segments = computeSegmentAngles(categoryTotals, grandTotal);
        expect(segments).toHaveLength(1);
        expect(segments[0].endAngle - segments[0].startAngle).toBeCloseTo(360, 10);
        return true;
      }),
      { numRuns: 50 }
    );
  });
});
