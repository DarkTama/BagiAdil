import Decimal from 'decimal.js';

Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

/**
 * Step A: Calculate the total food cost from all orders.
 * @param {Array<{name: string, amount: number|string|Decimal}>} orders
 * @returns {Decimal} total food cost
 */
export function calculateBaseTotals(orders) {
  return orders.reduce((sum, order) => sum.plus(new Decimal(order.amount)), new Decimal(0));
}

/**
 * Step B: Distribute discount proportionally based on each person's order amount.
 * @param {Array<{name: string, amount: number|string|Decimal}>} orders
 * @param {Decimal|number|string} totalFoodCost
 * @param {Decimal|number|string} totalDiscount
 * @returns {Array<{name: string, originalOrder: Decimal, discount: Decimal, discountedOrder: Decimal}>}
 */
export function distributeDiscount(orders, totalFoodCost, totalDiscount) {
  const food = new Decimal(totalFoodCost);
  const discount = new Decimal(totalDiscount);

  if (discount.isZero()) {
    return orders.map((order) => {
      const amount = new Decimal(order.amount);
      return {
        name: order.name,
        originalOrder: amount,
        discount: new Decimal(0),
        discountedOrder: amount,
      };
    });
  }

  return orders.map((order) => {
    const amount = new Decimal(order.amount);
    const proportion = food.isZero() ? new Decimal(0) : amount.div(food);
    const personDiscount = discount.mul(proportion);
    const discountedOrder = Decimal.max(amount.minus(personDiscount), new Decimal(0));
    return {
      name: order.name,
      originalOrder: amount,
      discount: personDiscount,
      discountedOrder,
    };
  });
}

/**
 * Step C: Distribute shipping cost evenly among all participants.
 * @param {number} numPeople
 * @param {Decimal|number|string} totalShipping
 * @returns {Decimal} shipping per person
 */
export function distributeShipping(numPeople, totalShipping) {
  const shipping = new Decimal(totalShipping);
  if (shipping.isZero() || numPeople === 0) {
    return new Decimal(0);
  }
  return shipping.div(numPeople);
}

/**
 * Step D: Calculate pre-rounding total for each person (discounted order + shipping share).
 * @param {Array<{name: string, discountedOrder: Decimal}>} discountedOrders
 * @param {Decimal} shippingPerPerson
 * @returns {Array<{name: string, preRoundingTotal: Decimal}>}
 */
export function calculatePreRounding(discountedOrders, shippingPerPerson) {
  return discountedOrders.map((item) => ({
    name: item.name,
    preRoundingTotal: item.discountedOrder.plus(shippingPerPerson),
  }));
}

/**
 * Step E: Round each amount to the nearest 100 using ROUND_HALF_UP.
 * @param {Array<Decimal|number|string>} amounts
 * @returns {Array<Decimal>}
 */
export function roundToNearestHundred(amounts) {
  return amounts.map(
    (amount) => new Decimal(amount).div(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).mul(100)
  );
}

/**
 * Rank people for a rounding adjustment: largest `key` first, ties by input
 * order. Keys are quantized so decimal.js division residue (e.g. 10000/3)
 * cannot break a genuine tie.
 * @param {Array<Decimal>} keys
 * @returns {Array<number>} indices in ranking order
 */
function rankBy(keys) {
  const q = keys.map((k) => k.toDecimalPlaces(6));
  return q.map((_, i) => i).sort((a, b) => q[b].comparedTo(q[a]) || a - b);
}

/**
 * Step F: Reconcile rounding so payments add up to the bill exactly.
 *
 * 1. Target = expectedTotal rounded to the nearest Rp 100 (HALF_UP).
 * 2. Steps = (target - sum of rounded payments) / 100, handed out as
 *    +/-100 by largest remainder: when payments are short, the people Step E
 *    rounded down the most get +100; when over, those it rounded up the most
 *    get -100. At most one step per person per pass; ties go to input order.
 * 3. Remainder = expectedTotal - target (-50..+49) when expectedTotal is not a
 *    multiple of 100. It goes to exactly one person: the one with the largest
 *    gap between pre-rounding amount and payment in the remainder's direction
 *    (most underpaying for a positive remainder, most overpaying for a
 *    negative one); ties go to input order. That person's payment is the
 *    only one not a multiple of 100.
 *
 * Every payment stays an integer, sums to expectedTotal exactly, and is
 * within Rp 150 of its pre-rounding amount (50 from rounding + one 100 step).
 * @param {Array<Decimal>} preRoundingAmounts
 * @param {Array<Decimal>} roundedAmounts
 * @param {Decimal|number|string} [expectedTotal] integer bill total; defaults
 *   to the sum of pre-rounding amounts to the whole rupiah
 * @returns {Array<Decimal>} reconciled payments
 */
export function reconcileRounding(preRoundingAmounts, roundedAmounts, expectedTotal) {
  const result = [...roundedAmounts];
  const n = result.length;
  if (n === 0) return result;

  const sum = (arr) => arr.reduce((s, a) => s.plus(a), new Decimal(0));
  const total =
    expectedTotal === undefined
      ? sum(preRoundingAmounts).toDecimalPlaces(0)
      : new Decimal(expectedTotal);
  const target = roundToNearestHundred([total])[0];

  // Step 2: Rp 100 steps by largest remainder.
  const steps = target.minus(sum(result)).div(100).toNumber();
  if (steps !== 0) {
    const sign = Math.sign(steps);
    // Remainder in the needed direction: pre - rounded when adding, rounded - pre when removing.
    const order = rankBy(preRoundingAmounts.map((pre, i) => pre.minus(roundedAmounts[i]).mul(sign)));
    for (let j = 0; j < Math.abs(steps); j++) {
      const i = order[j % n];
      result[i] = result[i].plus(100 * sign);
    }
  }

  // Step 3: sub-100 remainder to one person.
  const remainder = total.minus(target);
  if (!remainder.isZero()) {
    const sign = remainder.isPositive() ? 1 : -1;
    const [i] = rankBy(preRoundingAmounts.map((pre, k) => pre.minus(result[k]).mul(sign)));
    result[i] = result[i].plus(remainder);
  }

  return result;
}

/**
 * Parse a money input: a finite, non-negative, whole-rupiah amount.
 * @param {*} value
 * @param {string} label used in the error message
 * @returns {Decimal}
 */
function toMoney(value, label) {
  let d = null;
  try {
    d = new Decimal(value);
  } catch {
    // fall through to the error below
  }
  if (!d || !d.isFinite() || d.lt(0) || !d.isInteger()) {
    throw new Error(
      `splitBill: ${label} must be a non-negative whole rupiah amount, got ${String(value)}`
    );
  }
  return d;
}

/**
 * Main entry point: orchestrate bill splitting steps A through F.
 * Throws an Error for non-array orders or for amounts, discount or shipping
 * that are not finite, non-negative whole rupiah.
 * A discount larger than the food subtotal is clamped to the subtotal
 * (verification.discountClamped = true).
 * @param {{orders: Array<{name: string, amount: number|string}>, totalDiscount: number|string, totalShipping: number|string}} input
 * @returns {{participants: Array, grandTotal: Decimal, verification: {sumOfPayments: Decimal, expectedTotal: Decimal, balanced: boolean, discountClamped: boolean}}}
 */
export function splitBill({ orders, totalDiscount, totalShipping }) {
  if (!Array.isArray(orders)) {
    throw new Error('splitBill: orders must be an array');
  }
  const amounts = orders.map((order, i) => toMoney(order?.amount, `orders[${i}].amount`));
  const discountInput = toMoney(totalDiscount, 'totalDiscount');
  const shipping = toMoney(totalShipping, 'totalShipping');
  const cleanOrders = orders.map((order, i) => ({ name: order.name, amount: amounts[i] }));

  // Step A: Calculate base totals
  const totalFoodCost = calculateBaseTotals(cleanOrders);

  // A discount cannot exceed the food it discounts.
  const discountClamped = discountInput.greaterThan(totalFoodCost);
  const discount = discountClamped ? totalFoodCost : discountInput;

  // Step B: Distribute discount
  const discountResults = distributeDiscount(cleanOrders, totalFoodCost, discount);

  // Step C: Distribute shipping
  const numPeople = orders.length;
  const shippingPerPerson = distributeShipping(numPeople, shipping);

  // Step D: Calculate pre-rounding totals
  const preRoundingResults = calculatePreRounding(discountResults, shippingPerPerson);

  // Expected total: food - discount + shipping (an exact integer)
  const expectedTotal = totalFoodCost.minus(discount).plus(shipping);

  // Step E: Round to nearest 100
  const preRoundingAmounts = preRoundingResults.map((r) => r.preRoundingTotal);
  const roundedAmounts = roundToNearestHundred(preRoundingAmounts);

  // Step F: Reconcile rounding against the exact bill total
  const finalAmounts = reconcileRounding(preRoundingAmounts, roundedAmounts, expectedTotal);

  const sumOfPayments = finalAmounts.reduce((sum, a) => sum.plus(a), new Decimal(0));

  // Build participants array
  const participants = orders.map((order, i) => ({
    name: order.name,
    originalOrder: discountResults[i].originalOrder,
    discount: discountResults[i].discount,
    discountedOrder: discountResults[i].discountedOrder,
    shippingShare: shippingPerPerson,
    preRoundingTotal: preRoundingResults[i].preRoundingTotal,
    finalPayment: finalAmounts[i],
  }));

  return {
    participants,
    grandTotal: expectedTotal,
    verification: {
      sumOfPayments,
      expectedTotal,
      // Exact: Step F reconciles against the integer expectedTotal.
      // Empty orders with shipping > 0 is the only way this is false.
      balanced: sumOfPayments.equals(expectedTotal),
      discountClamped,
    },
  };
}
