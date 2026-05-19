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
 * Step F: Reconcile rounding differences to ensure sum of payments equals expected total.
 * Find the difference between sum of pre-rounding amounts and sum of rounded amounts.
 * Identify the person with the highest decimal fraction (preRounding - rounded).
 * Add the difference to that person's payment and re-round.
 * Deterministic tie-breaking: first person in list order wins.
 * @param {Array<Decimal>} preRoundingAmounts
 * @param {Array<Decimal>} roundedAmounts
 * @returns {Array<Decimal>} reconciled rounded amounts
 */
export function reconcileRounding(preRoundingAmounts, roundedAmounts) {
  const sumPreRounding = preRoundingAmounts.reduce((sum, a) => sum.plus(a), new Decimal(0));
  const sumRounded = roundedAmounts.reduce((sum, a) => sum.plus(a), new Decimal(0));
  const difference = sumPreRounding.minus(sumRounded);

  if (difference.isZero()) {
    return [...roundedAmounts];
  }

  // Find person with highest decimal fraction (preRounding - rounded in absolute terms)
  // This identifies who lost the most in rounding
  let maxFractionIndex = 0;
  let maxFraction = preRoundingAmounts[0].minus(roundedAmounts[0]).abs();

  for (let i = 1; i < preRoundingAmounts.length; i++) {
    const fraction = preRoundingAmounts[i].minus(roundedAmounts[i]).abs();
    if (fraction.greaterThan(maxFraction)) {
      maxFraction = fraction;
      maxFractionIndex = i;
    }
    // Tie-breaking: first in list order wins (do nothing, keep current maxFractionIndex)
  }

  // Adjust that person's pre-rounding amount by the difference, then re-round
  const adjusted = preRoundingAmounts[maxFractionIndex].plus(difference);
  const reRounded = new Decimal(adjusted).div(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).mul(100);

  const result = [...roundedAmounts];
  result[maxFractionIndex] = reRounded;
  return result;
}

/**
 * Main entry point: orchestrate bill splitting steps A through F.
 * @param {{orders: Array<{name: string, amount: number|string}>, totalDiscount: number|string, totalShipping: number|string}} input
 * @returns {{participants: Array, grandTotal: Decimal, verification: {sumOfPayments: Decimal, expectedTotal: Decimal, balanced: boolean}}}
 */
export function splitBill({ orders, totalDiscount, totalShipping }) {
  // Step A: Calculate base totals
  const totalFoodCost = calculateBaseTotals(orders);

  // Step B: Distribute discount
  const discountResults = distributeDiscount(orders, totalFoodCost, totalDiscount);

  // Step C: Distribute shipping
  const numPeople = orders.length;
  const shippingPerPerson = distributeShipping(numPeople, totalShipping);

  // Step D: Calculate pre-rounding totals
  const preRoundingResults = calculatePreRounding(discountResults, shippingPerPerson);

  // Step E: Round to nearest 100
  const preRoundingAmounts = preRoundingResults.map((r) => r.preRoundingTotal);
  const roundedAmounts = roundToNearestHundred(preRoundingAmounts);

  // Step F: Reconcile rounding
  const finalAmounts = reconcileRounding(preRoundingAmounts, roundedAmounts);

  // Expected total: food - discount + shipping
  const expectedTotal = totalFoodCost
    .minus(new Decimal(totalDiscount))
    .plus(new Decimal(totalShipping));

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
      balanced: sumOfPayments.equals(expectedTotal),
    },
  };
}
