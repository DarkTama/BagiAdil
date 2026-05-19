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

  it('adjusts the person with highest rounding fraction', () => {
    // Person 0: pre=24080, rounded=24100 (diff = -20, abs fraction = 20)
    // Person 1: pre=32070, rounded=32100 (diff = -30, abs fraction = 30)
    // Sum pre = 56150, sum rounded = 56200, difference = -50
    // Person 1 has higher fraction, adjust their pre-rounding by -50: 32070 + (-50) = 32020
    // Re-round 32020: 32020/100 = 320.2 -> rounds to 320 -> 32000
    const preRounding = [new Decimal(24080), new Decimal(32070)];
    const rounded = [new Decimal(24100), new Decimal(32100)];
    const result = reconcileRounding(preRounding, rounded);
    expect(result[0].equals(new Decimal(24100))).toBe(true);
    expect(result[1].equals(new Decimal(32000))).toBe(true);
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
