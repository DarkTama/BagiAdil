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
 * After re-rounding, verify the sum balances. If not, try the next candidate.
 * If no single candidate fixes it, apply the difference directly (in Rp 100 increments)
 * to ensure the bill always balances.
 * Deterministic tie-breaking: first person in list order wins.
 * @param {Array<Decimal>} preRoundingAmounts
 * @param {Array<Decimal>} roundedAmounts
 * @returns {Array<Decimal>} reconciled rounded amounts
 */
export function reconcileRounding(preRoundingAmounts, roundedAmounts) {
  const sumPreRounding = preRoundingAmounts.reduce((sum, a) => sum.plus(a), new Decimal(0));
  const sumRounded = roundedAmounts.reduce((sum, a) => sum.plus(a), new Decimal(0));
  const difference = sumPreRounding.minus(sumRounded);

  if (difference.isZero() || difference.abs().lessThan(new Decimal(1))) {
    return [...roundedAmounts];
  }

  // Sort candidates by absolute rounding fraction (descending), with index for tie-breaking
  const candidates = preRoundingAmounts.map((pre, i) => ({
    index: i,
    fraction: pre.minus(roundedAmounts[i]).abs(),
  }));
  candidates.sort((a, b) => {
    const cmp = b.fraction.minus(a.fraction).toNumber();
    if (cmp !== 0) return cmp;
    // Tie-breaking: first in list order wins (lower index first)
    return a.index - b.index;
  });

  // Try each candidate: adjust their pre-rounding amount by the difference, then re-round
  for (const candidate of candidates) {
    const adjusted = preRoundingAmounts[candidate.index].plus(difference);
    const reRounded = new Decimal(adjusted)
      .div(100)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      .mul(100);

    const result = [...roundedAmounts];
    result[candidate.index] = reRounded;

    // Verify the new sum equals the pre-rounding sum
    const newSum = result.reduce((sum, a) => sum.plus(a), new Decimal(0));
    if (newSum.equals(sumPreRounding)) {
      return result;
    }
  }

  // Fallback: apply the difference directly in Rp 100 increments to the top candidate(s).
  // The difference between sumPreRounding and sumRounded is always a multiple of some amount
  // since pre-rounding amounts may not be multiples of 100.
  // Round the difference itself to the nearest 100 and apply it.
  const result = [...roundedAmounts];
  const roundedDifference = difference.div(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).mul(100);
  result[candidates[0].index] = roundedAmounts[candidates[0].index].plus(roundedDifference);

  // Check if balanced after rounding the difference
  const newSum = result.reduce((sum, a) => sum.plus(a), new Decimal(0));
  if (!newSum.equals(sumPreRounding)) {
    // Final fallback: apply exact difference to maintain balance
    // (result may not be a multiple of 100, but bill will balance)
    result[candidates[0].index] = roundedAmounts[candidates[0].index].plus(difference);
  }

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
      // Compare to the whole rupiah. Splitting a discount proportionally
      // involves divisions (e.g. 68899/91798) that decimal.js truncates,
      // leaving a sub-rupiah residue; an exact comparison would wrongly flag
      // that as "unbalanced". A genuine imbalance (such as a discount clamped
      // to zero) is always rupiah-scale and is still caught.
      balanced: sumOfPayments
        .toDecimalPlaces(0)
        .equals(expectedTotal.toDecimalPlaces(0)),
    },
  };
}
