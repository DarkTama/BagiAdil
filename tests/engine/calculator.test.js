import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import {
  calculateBaseTotals,
  distributeDiscount,
  distributeShipping,
  calculatePreRounding,
  roundToNearestHundred,
  reconcileRounding,
  splitBill,
} from '../../src/engine/calculator.js';

describe('calculateBaseTotals (Step A)', () => {
  it('calculates total from multiple orders', () => {
    const orders = [
      { name: 'Alice', amount: 25000 },
      { name: 'Bob', amount: 35000 },
    ];
    const total = calculateBaseTotals(orders);
    expect(total.equals(new Decimal(60000))).toBe(true);
  });

  it('handles single order', () => {
    const orders = [{ name: 'Alice', amount: 42000 }];
    const total = calculateBaseTotals(orders);
    expect(total.equals(new Decimal(42000))).toBe(true);
  });
});

describe('distributeDiscount (Step B)', () => {
  it('distributes discount proportionally', () => {
    const orders = [
      { name: 'Alice', amount: 25000 },
      { name: 'Bob', amount: 35000 },
    ];
    const totalFoodCost = new Decimal(60000);
    const totalDiscount = new Decimal(12000);
    const result = distributeDiscount(orders, totalFoodCost, totalDiscount);

    // Alice: 25000/60000 * 12000 = 5000
    expect(result[0].discount.equals(new Decimal(5000))).toBe(true);
    expect(result[0].discountedOrder.equals(new Decimal(20000))).toBe(true);
    // Bob: 35000/60000 * 12000 = 7000
    expect(result[1].discount.equals(new Decimal(7000))).toBe(true);
    expect(result[1].discountedOrder.equals(new Decimal(28000))).toBe(true);
  });

  it('returns zero discount when totalDiscount is zero', () => {
    const orders = [
      { name: 'Alice', amount: 25000 },
      { name: 'Bob', amount: 35000 },
    ];
    const result = distributeDiscount(orders, 60000, 0);
    expect(result[0].discount.equals(new Decimal(0))).toBe(true);
    expect(result[0].discountedOrder.equals(new Decimal(25000))).toBe(true);
    expect(result[1].discount.equals(new Decimal(0))).toBe(true);
    expect(result[1].discountedOrder.equals(new Decimal(35000))).toBe(true);
  });

  it('clamps discounted order to zero when discount exceeds order amount', () => {
    const orders = [
      { name: 'Alice', amount: 5000 },
      { name: 'Bob', amount: 35000 },
    ];
    const totalFoodCost = new Decimal(40000);
    // Alice proportion: 5000/40000 = 0.125, discount = 50000 * 0.125 = 6250 > 5000
    const result = distributeDiscount(orders, totalFoodCost, 50000);
    expect(result[0].discountedOrder.equals(new Decimal(0))).toBe(true);
  });
});

describe('distributeShipping (Step C)', () => {
  it('distributes shipping evenly', () => {
    const result = distributeShipping(3, 12000);
    expect(result.equals(new Decimal(4000))).toBe(true);
  });

  it('returns zero when shipping is zero', () => {
    const result = distributeShipping(3, 0);
    expect(result.equals(new Decimal(0))).toBe(true);
  });

  it('handles non-even division', () => {
    const result = distributeShipping(3, 10000);
    // 10000/3 = 3333.333...
    expect(result.toNumber()).toBeCloseTo(3333.333, 2);
  });
});

describe('calculatePreRounding (Step D)', () => {
  it('adds shipping to each discounted order', () => {
    const discountedOrders = [
      { name: 'Alice', discountedOrder: new Decimal(20000) },
      { name: 'Bob', discountedOrder: new Decimal(28000) },
    ];
    const shippingPerPerson = new Decimal(4000);
    const result = calculatePreRounding(discountedOrders, shippingPerPerson);
    expect(result[0].preRoundingTotal.equals(new Decimal(24000))).toBe(true);
    expect(result[1].preRoundingTotal.equals(new Decimal(32000))).toBe(true);
  });
});

describe('roundToNearestHundred (Step E)', () => {
  it('rounds to nearest 100 with HALF_UP', () => {
    const amounts = [new Decimal(24050), new Decimal(32150)];
    const result = roundToNearestHundred(amounts);
    expect(result[0].equals(new Decimal(24100))).toBe(true);
    expect(result[1].equals(new Decimal(32200))).toBe(true);
  });

  it('rounds 50 up (HALF_UP)', () => {
    const amounts = [new Decimal(24050)];
    const result = roundToNearestHundred(amounts);
    expect(result[0].equals(new Decimal(24100))).toBe(true);
  });

  it('rounds down when below 50', () => {
    const amounts = [new Decimal(24049)];
    const result = roundToNearestHundred(amounts);
    expect(result[0].equals(new Decimal(24000))).toBe(true);
  });

  it('keeps exact multiples of 100 unchanged', () => {
    const amounts = [new Decimal(25000)];
    const result = roundToNearestHundred(amounts);
    expect(result[0].equals(new Decimal(25000))).toBe(true);
  });
});

describe('reconcileRounding (Step F)', () => {
  it('returns same amounts when no difference', () => {
    const preRounding = [new Decimal(24000), new Decimal(32000)];
    const rounded = [new Decimal(24000), new Decimal(32000)];
    const result = reconcileRounding(preRounding, rounded);
    expect(result[0].equals(new Decimal(24000))).toBe(true);
    expect(result[1].equals(new Decimal(32000))).toBe(true);
  });

  it('takes the Rp 100 step from the person rounded up the most', () => {
    // Person 0: pre=24080, rounded=24100 (rounded up 20)
    // Person 1: pre=32020, rounded=32100 (rounded up 80)
    // Target 56100, rounded sum 56200 -> one -100 step, to Person 1 (moved furthest up).
    // Person 1 ends 20 under their share instead of Person 0 ending 80 under.
    const preRounding = [new Decimal(24080), new Decimal(32020)];
    const rounded = [new Decimal(24100), new Decimal(32100)];
    const result = reconcileRounding(preRounding, rounded);
    expect(result[0].equals(new Decimal(24100))).toBe(true);
    expect(result[1].equals(new Decimal(32000))).toBe(true);
    const sum = result.reduce((s, a) => s.plus(a), new Decimal(0));
    expect(sum.equals(new Decimal(56100))).toBe(true);
  });

  it('uses deterministic tie-breaking (first in list wins)', () => {
    // Both have same absolute fraction
    // Person 0: pre=24050, rounded=24100 (abs fraction = 50)
    // Person 1: pre=32050, rounded=32100 (abs fraction = 50)
    // Sum pre = 56100, sum rounded = 56200, difference = -100
    // Tie: first person wins, so adjust person 0
    // 24050 + (-100) = 23950, re-round: 23950/100 = 239.5 -> 240 -> 24000
    const preRounding = [new Decimal(24050), new Decimal(32050)];
    const rounded = [new Decimal(24100), new Decimal(32100)];
    const result = reconcileRounding(preRounding, rounded);
    expect(result[0].equals(new Decimal(24000))).toBe(true);
    expect(result[1].equals(new Decimal(32100))).toBe(true);
  });

  it('puts a sub-100 negative remainder on the person who overpays the most', () => {
    // Craft a scenario where adjusting the first candidate introduces a new rounding error.
    // Person 0: pre=24949, rounded=24900 (fraction = 49)
    // Person 1: pre=25051, rounded=25100 (fraction = 49)
    // Person 2: pre=25050, rounded=25100 (fraction = 50)
    // Sum pre = 75050, sum rounded = 75100, difference = -50
    // Top candidate by fraction: Person 2 (fraction 50)
    // Adjust Person 2: 25050 + (-50) = 25000, re-round: 25000/100 = 250 -> 25000
    // New sum: 24900 + 25100 + 25000 = 75000 != 75050 -- still off!
    // Next candidate: Person 0 (fraction 49, index 0 wins tie with Person 1)
    // Adjust Person 0: 24949 + (-50) = 24899, re-round: 24899/100 = 248.99 -> 249 -> 24900
    // New sum: 24900 + 25100 + 25100 = 75100 != 75050 -- still off!
    // Next candidate: Person 1 (fraction 49, index 1)
    // Adjust Person 1: 25051 + (-50) = 25001, re-round: 25001/100 = 250.01 -> 250 -> 25000
    // New sum: 24900 + 25000 + 25100 = 75000 != 75050 -- still off!
    // Fallback: apply difference directly to top candidate (Person 2)
    // Result: 24900 + 25100 + (25100 + (-50)) = 24900 + 25100 + 25050 = 75050 -- balanced!
    const preRounding = [new Decimal(24949), new Decimal(25051), new Decimal(25050)];
    const rounded = [new Decimal(24900), new Decimal(25100), new Decimal(25100)];
    const result = reconcileRounding(preRounding, rounded);
    // Target 75050 rounds (half up) to 75100 = rounded sum, so no steps;
    // remainder -50 goes to Person 2, who is +50 over their share.
    expect(result.map((r) => r.toNumber())).toEqual([24900, 25100, 25050]);
  });

  it('puts a sub-100 positive remainder on the person who underpays the most', () => {
    // Target 60030 -> 60000; rounded sum 60000; remainder +30.
    // Person 1 is 40 under (pre 20040 -> 20000), Person 0 only 30 under.
    const preRounding = [new Decimal(20030), new Decimal(20040), new Decimal(19960)];
    const rounded = roundToNearestHundred(preRounding);
    const result = reconcileRounding(preRounding, rounded, new Decimal(60030));
    expect(result.map((r) => r.toNumber())).toEqual([20000, 20030, 20000]);
  });

  it('gives at most one step per person (largest remainder)', () => {
    // 10 x 10040: rounded sum 100000, target 100400 -> four +100 steps,
    // to the first four people (all tied), one each.
    const preRounding = Array.from({ length: 10 }, () => new Decimal(10040));
    const result = reconcileRounding(preRounding, roundToNearestHundred(preRounding));
    expect(result.map((r) => r.toNumber())).toEqual([
      10100, 10100, 10100, 10100, 10000, 10000, 10000, 10000, 10000, 10000,
    ]);
  });

  it('returns an empty array for no participants', () => {
    expect(reconcileRounding([], [], new Decimal(0))).toEqual([]);
  });
});

describe('splitBill (main entry)', () => {
  it('basic 2-person split with discount and shipping', () => {
    const result = splitBill({
      orders: [
        { name: 'Alice', amount: 25000 },
        { name: 'Bob', amount: 35000 },
      ],
      totalDiscount: 10000,
      totalShipping: 8000,
    });

    expect(result.participants).toHaveLength(2);
    expect(result.participants[0].name).toBe('Alice');
    expect(result.participants[1].name).toBe('Bob');

    // All final payments should be multiples of 100
    result.participants.forEach((p) => {
      expect(p.finalPayment.mod(100).equals(new Decimal(0))).toBe(true);
    });

    // Grand total should be food - discount + shipping = 60000 - 10000 + 8000 = 58000
    expect(result.grandTotal.equals(new Decimal(58000))).toBe(true);
  });

  it('3-person split with varying amounts (realistic Indonesian amounts)', () => {
    const result = splitBill({
      orders: [
        { name: 'Alice', amount: 25000 },
        { name: 'Bob', amount: 35000 },
        { name: 'Charlie', amount: 42000 },
      ],
      totalDiscount: 15000,
      totalShipping: 12000,
    });

    expect(result.participants).toHaveLength(3);

    // Expected total: 102000 - 15000 + 12000 = 99000
    expect(result.grandTotal.equals(new Decimal(99000))).toBe(true);

    // All final payments should be multiples of 100
    result.participants.forEach((p) => {
      expect(p.finalPayment.mod(100).equals(new Decimal(0))).toBe(true);
    });

    // Verify discount is proportional (larger order -> larger discount)
    expect(result.participants[2].discount.greaterThan(result.participants[1].discount)).toBe(true);
    expect(result.participants[1].discount.greaterThan(result.participants[0].discount)).toBe(true);

    // Shipping should be equal for all
    expect(result.participants[0].shippingShare.equals(result.participants[1].shippingShare)).toBe(
      true
    );
    expect(result.participants[1].shippingShare.equals(result.participants[2].shippingShare)).toBe(
      true
    );
  });

  it('single participant edge case', () => {
    const result = splitBill({
      orders: [{ name: 'Solo', amount: 45000 }],
      totalDiscount: 10000,
      totalShipping: 8000,
    });

    expect(result.participants).toHaveLength(1);
    // Total: 45000 - 10000 + 8000 = 43000
    expect(result.grandTotal.equals(new Decimal(43000))).toBe(true);
    expect(result.participants[0].discount.equals(new Decimal(10000))).toBe(true);
    expect(result.participants[0].discountedOrder.equals(new Decimal(35000))).toBe(true);
    expect(result.participants[0].shippingShare.equals(new Decimal(8000))).toBe(true);
  });

  it('zero discount scenario', () => {
    const result = splitBill({
      orders: [
        { name: 'Alice', amount: 25000 },
        { name: 'Bob', amount: 35000 },
      ],
      totalDiscount: 0,
      totalShipping: 8000,
    });

    // Discounted orders should equal original orders
    expect(result.participants[0].discount.equals(new Decimal(0))).toBe(true);
    expect(result.participants[0].discountedOrder.equals(new Decimal(25000))).toBe(true);
    expect(result.participants[1].discount.equals(new Decimal(0))).toBe(true);
    expect(result.participants[1].discountedOrder.equals(new Decimal(35000))).toBe(true);

    // Grand total: 60000 - 0 + 8000 = 68000
    expect(result.grandTotal.equals(new Decimal(68000))).toBe(true);
  });

  it('zero shipping scenario', () => {
    const result = splitBill({
      orders: [
        { name: 'Alice', amount: 25000 },
        { name: 'Bob', amount: 35000 },
      ],
      totalDiscount: 10000,
      totalShipping: 0,
    });

    expect(result.participants[0].shippingShare.equals(new Decimal(0))).toBe(true);
    expect(result.participants[1].shippingShare.equals(new Decimal(0))).toBe(true);

    // Grand total: 60000 - 10000 + 0 = 50000
    expect(result.grandTotal.equals(new Decimal(50000))).toBe(true);
  });

  it('Step F reconciliation - sum of final payments equals expected total', () => {
    const result = splitBill({
      orders: [
        { name: 'Alice', amount: 25000 },
        { name: 'Bob', amount: 35000 },
        { name: 'Charlie', amount: 42000 },
      ],
      totalDiscount: 15000,
      totalShipping: 12000,
    });

    expect(result.verification.balanced).toBe(true);
    expect(result.verification.sumOfPayments.equals(result.verification.expectedTotal)).toBe(true);
  });

  it('balances exactly for a proportional-discount split (no sub-rupiah residue)', () => {
    // Splitting the discount proportionally over uneven orders involves
    // divisions decimal.js cannot represent exactly. Payments must still be
    // whole rupiah and add up to the bill exactly.
    const result = splitBill({
      orders: [
        { name: 'Alice', amount: 25000 },
        { name: 'Bob', amount: 35000 },
        { name: 'Charlie', amount: 42001 },
      ],
      totalDiscount: 15000,
      totalShipping: 10000,
    });

    expect(result.grandTotal.equals(new Decimal(97001))).toBe(true);
    expect(result.verification.sumOfPayments.equals(new Decimal(97001))).toBe(true);
    expect(result.verification.balanced).toBe(true);
    result.participants.forEach((p) => expect(p.finalPayment.isInteger()).toBe(true));
  });

  it('clamps a discount larger than the food subtotal', () => {
    // Discount 30000 on 20000 of food: only 20000 can be discounted.
    const result = splitBill({
      orders: [
        { name: 'Alice', amount: 10000 },
        { name: 'Bob', amount: 10000 },
      ],
      totalDiscount: 30000,
      totalShipping: 5000,
    });
    expect(result.grandTotal.equals(new Decimal(5000))).toBe(true);
    expect(result.verification.balanced).toBe(true);
    expect(result.verification.discountClamped).toBe(true);
    expect(result.participants.map((p) => p.finalPayment.toNumber())).toEqual([2500, 2500]);
  });

  it('tie-breaking determinism - first person in list order wins', () => {
    // Create a scenario where two people have the same rounding fraction
    // Both should have identical fractional parts so tie-breaking applies
    const result = splitBill({
      orders: [
        { name: 'Alice', amount: 30000 },
        { name: 'Bob', amount: 30000 },
      ],
      totalDiscount: 0,
      totalShipping: 10000,
    });

    // Both get 30000 + 5000 = 35000 each (exact, no rounding needed)
    // Expected total: 60000 + 10000 = 70000
    expect(result.grandTotal.equals(new Decimal(70000))).toBe(true);
    expect(result.participants[0].finalPayment.equals(result.participants[1].finalPayment)).toBe(
      true
    );

    // More interesting case with non-even shipping creating identical fractions
    const result2 = splitBill({
      orders: [
        { name: 'Alice', amount: 20000 },
        { name: 'Bob', amount: 20000 },
      ],
      totalDiscount: 0,
      totalShipping: 9000,
    });

    // Each: 20000 + 4500 = 24500, rounds to 24500
    // Both have same fraction. If reconciliation needed, first wins.
    // Expected total: 40000 + 9000 = 49000
    expect(result2.grandTotal.equals(new Decimal(49000))).toBe(true);
    // Both round to 24500 -> 24500/100 = 245 -> 24500 (already multiple of 100)
    expect(result2.verification.balanced).toBe(true);
  });

  it('guard against negative totals - discount exceeds item price', () => {
    const result = splitBill({
      orders: [
        { name: 'Alice', amount: 5000 },
        { name: 'Bob', amount: 45000 },
      ],
      totalDiscount: 40000,
      totalShipping: 8000,
    });

    // Alice: 5000/50000 * 40000 = 4000 discount, discountedOrder = 1000
    // Bob: 45000/50000 * 40000 = 36000 discount, discountedOrder = 9000
    // No negative here. Let's test with extreme discount:
    expect(result.participants[0].discountedOrder.greaterThanOrEqualTo(new Decimal(0))).toBe(true);
    expect(result.participants[1].discountedOrder.greaterThanOrEqualTo(new Decimal(0))).toBe(true);

    // Test with discount > total food cost applied to small item
    const result2 = splitBill({
      orders: [
        { name: 'Alice', amount: 3000 },
        { name: 'Bob', amount: 47000 },
      ],
      totalDiscount: 48000,
      totalShipping: 5000,
    });

    // Alice: 3000/50000 * 48000 = 2880, discountedOrder = 120 (still positive)
    // Bob: 47000/50000 * 48000 = 45120, discountedOrder = 1880
    expect(result2.participants[0].discountedOrder.greaterThanOrEqualTo(new Decimal(0))).toBe(true);
    expect(result2.participants[1].discountedOrder.greaterThanOrEqualTo(new Decimal(0))).toBe(true);
  });

  it('extreme discount exceeding individual order amounts', () => {
    // Proportional discount can exceed individual order if total discount > total food
    // but clamp should protect
    const result = splitBill({
      orders: [
        { name: 'Alice', amount: 10000 },
        { name: 'Bob', amount: 10000 },
      ],
      totalDiscount: 30000,
      totalShipping: 5000,
    });

    // Each person: 10000/20000 * 30000 = 15000 discount, but order is only 10000
    // Clamped to 0
    expect(result.participants[0].discountedOrder.equals(new Decimal(0))).toBe(true);
    expect(result.participants[1].discountedOrder.equals(new Decimal(0))).toBe(true);
  });
});

describe('splitBill fair rounding (audit cases)', () => {
  const people = (n, amount) =>
    Array.from({ length: n }, (_, i) => ({ name: `P${i}`, amount }));
  const payments = (result) => result.participants.map((p) => p.finalPayment.toNumber());

  it('10 x 10.040: no one pays more than Rp 100 over their rounded share', () => {
    const result = splitBill({ orders: people(10, 10040), totalDiscount: 0, totalShipping: 0 });
    expect(payments(result)).toEqual([
      10100, 10100, 10100, 10100, 10000, 10000, 10000, 10000, 10000, 10000,
    ]);
    expect(result.verification.balanced).toBe(true);
  });

  it('3 x 20.000 + shipping 10.000: whole-rupiah payments', () => {
    const result = splitBill({ orders: people(3, 20000), totalDiscount: 0, totalShipping: 10000 });
    expect(payments(result)).toEqual([23400, 23300, 23300]);
    expect(result.verification.sumOfPayments.equals(new Decimal(70000))).toBe(true);
  });

  it('7 x 18.000 + shipping 12.000: whole-rupiah payments', () => {
    const result = splitBill({ orders: people(7, 18000), totalDiscount: 0, totalShipping: 12000 });
    expect(payments(result)).toEqual([19800, 19700, 19700, 19700, 19700, 19700, 19700]);
    expect(result.verification.sumOfPayments.equals(new Decimal(138000))).toBe(true);
  });

  it('single person 12.345 - 1.000 + 2.000 pays the exact odd total', () => {
    const result = splitBill({ orders: people(1, 12345), totalDiscount: 1000, totalShipping: 2000 });
    expect(payments(result)).toEqual([13345]);
    expect(result.verification.balanced).toBe(true);
  });

  it('discount 20.000 on 15.000 food + 5.000 shipping is clamped', () => {
    const result = splitBill({ orders: people(1, 15000), totalDiscount: 20000, totalShipping: 5000 });
    expect(payments(result)).toEqual([5000]);
    expect(result.grandTotal.equals(new Decimal(5000))).toBe(true);
    expect(result.verification.discountClamped).toBe(true);
    expect(result.verification.balanced).toBe(true);
  });

  it('does not flag a discount within the subtotal as clamped', () => {
    const result = splitBill({ orders: people(2, 10000), totalDiscount: 20000, totalShipping: 0 });
    expect(result.verification.discountClamped).toBe(false);
    expect(payments(result)).toEqual([0, 0]);
  });

  it('returns an empty, balanced result for no orders', () => {
    const result = splitBill({ orders: [], totalDiscount: 0, totalShipping: 0 });
    expect(result.participants).toEqual([]);
    expect(result.verification.balanced).toBe(true);
  });
});

describe('splitBill input guard', () => {
  const ok = { orders: [{ name: 'A', amount: 10000 }], totalDiscount: 0, totalShipping: 0 };

  it.each([
    ['orders not an array', { ...ok, orders: null }],
    ['orders an object', { ...ok, orders: { name: 'A', amount: 1 } }],
    ['NaN amount', { ...ok, orders: [{ name: 'A', amount: NaN }] }],
    ['negative amount', { ...ok, orders: [{ name: 'A', amount: -1 }] }],
    ['Infinity amount', { ...ok, orders: [{ name: 'A', amount: Infinity }] }],
    ['missing amount', { ...ok, orders: [{ name: 'A' }] }],
    ['non-integer amount', { ...ok, orders: [{ name: 'A', amount: 100.5 }] }],
    ['NaN discount', { ...ok, totalDiscount: NaN }],
    ['negative discount', { ...ok, totalDiscount: -500 }],
    ['undefined discount', { ...ok, totalDiscount: undefined }],
    ['text shipping', { ...ok, totalShipping: 'abc' }],
    ['negative shipping', { ...ok, totalShipping: -1 }],
    ['Infinity shipping', { ...ok, totalShipping: Infinity }],
  ])('throws a clear Error for %s', (_label, input) => {
    expect(() => splitBill(input)).toThrow(/splitBill: /);
  });

  it('accepts zero discount and shipping (empty UI fields)', () => {
    expect(() => splitBill(ok)).not.toThrow();
  });
});

describe('splitBill rounding invariants (seeded property test)', () => {
  // mulberry32: small deterministic PRNG so failures are reproducible.
  function mulberry32(seed) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it('holds for 2000 random bills', () => {
    const rand = mulberry32(20261127);
    const int = (max) => Math.floor(rand() * (max + 1));
    // Mix generators: raw rupiah, round (multiples of 100/500/1000), and
    // repeated identical amounts (ties), so every branch gets exercised.
    const money = (mode, max) => {
      if (mode === 0) return int(max);
      const step = [100, 500, 1000][int(2)];
      return int(Math.floor(max / step)) * step;
    };

    for (let c = 0; c < 2000; c++) {
      const mode = c % 3; // 0 raw, 1 round, 2 repeated
      const n = 1 + int(29);
      const same = money(mode === 0 ? 0 : 1, 500000);
      const orders = Array.from({ length: n }, (_, i) => ({
        name: `P${i}`,
        amount: mode === 2 ? same : money(mode, 500000),
      }));
      const totalDiscount = money(mode === 0 ? 0 : 1, 100000);
      const totalShipping = money(mode === 0 ? 0 : 1, 100000);
      const ctx = JSON.stringify({ c, orders: orders.map((o) => o.amount), totalDiscount, totalShipping });

      const result = splitBill({ orders, totalDiscount, totalShipping });
      const food = orders.reduce((s, o) => s + o.amount, 0);
      const expected = food - Math.min(totalDiscount, food) + totalShipping;

      expect(result.verification.expectedTotal.toNumber(), ctx).toBe(expected);
      expect(result.verification.discountClamped, ctx).toBe(totalDiscount > food);
      expect(result.verification.balanced, ctx).toBe(true);

      let sum = new Decimal(0);
      let offHundred = 0;
      for (const p of result.participants) {
        expect(p.finalPayment.isInteger(), ctx).toBe(true);
        if (!p.finalPayment.mod(100).isZero()) offHundred++;
        expect(p.finalPayment.minus(p.preRoundingTotal).abs().lessThan(200), ctx).toBe(true);
        sum = sum.plus(p.finalPayment);
      }
      expect(offHundred, ctx).toBeLessThanOrEqual(expected % 100 === 0 ? 0 : 1);
      expect(sum.toNumber(), ctx).toBe(expected);
    }
  });
});
