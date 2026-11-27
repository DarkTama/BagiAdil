/**
 * Confidence scoring for OCR results.
 * Combines OCR engine confidence with parsing completeness.
 */

/**
 * Score confidence based on OCR confidence and parsed result quality.
 * @param {number} ocrConfidence - Tesseract confidence score (0-100)
 * @param {{items: Array<{name: string, quantity: number, price: number, total: number}>, subtotal: number, discount: number, deliveryFee: number}} parsedResult
 * @returns {{overall: number, level: 'high'|'medium'|'low', issues: Array<{key: string, n?: number, itemsTotal?: number, subtotal?: number, diff?: number}>}}
 */
export function scoreConfidence(ocrConfidence, parsedResult) {
  const issues = [];
  let score = 0;

  // OCR confidence contributes 50% of the score
  const ocrScore = Math.max(0, Math.min(100, ocrConfidence || 0));
  score += ocrScore * 0.5;

  // Items found contributes 20%
  const itemCount = parsedResult.items ? parsedResult.items.length : 0;
  if (itemCount === 0) {
    issues.push({ key: 'confidence.noItems' });
  } else if (itemCount >= 1) {
    // Scale: 1 item = 50%, 2 items = 75%, 3+ items = 100% of the 20 points
    const itemScore = Math.min(1, (itemCount + 1) / 4);
    score += itemScore * 20;
  }

  // Subtotal found and matching items sum contributes 15%
  let hasSubtotalMismatch = false;
  if (parsedResult.subtotal > 0) {
    if (itemCount > 0) {
      const itemsSum = parsedResult.items.reduce(
        (sum, item) => sum + (item.total ?? item.price * (item.quantity || 1)),
        0,
      );
      const diff = Math.abs(itemsSum - parsedResult.subtotal);
      if (diff === 0) {
        score += 15;
      } else {
        hasSubtotalMismatch = true;
        issues.push({
          key: 'confidence.subtotalMismatch',
          itemsTotal: itemsSum,
          subtotal: parsedResult.subtotal,
          diff,
        });
      }
    } else {
      score += 15;
    }
  } else {
    issues.push({ key: 'confidence.noSubtotal' });
  }

  // Price reasonableness contributes 15%
  if (parsedResult.items && parsedResult.items.length > 0) {
    const allReasonable = parsedResult.items.every((item) => {
      return item.price > 0 && item.price >= 1000 && item.price <= 2000000;
    });
    if (allReasonable) {
      score += 15;
    } else {
      const unreasonableItems = parsedResult.items.filter(
        (item) => item.price <= 0 || item.price < 1000 || item.price > 2000000,
      );
      if (unreasonableItems.length > 0) {
        issues.push({ key: 'confidence.unusualPrices', n: unreasonableItems.length });
      }
      // Partial credit
      const reasonableCount = parsedResult.items.length - unreasonableItems.length;
      score += (reasonableCount / parsedResult.items.length) * 15;
    }
  }

  // Clamp overall score, capping below 'high' when subtotal does not match items
  let overall = Math.round(Math.max(0, Math.min(100, score)));
  if (hasSubtotalMismatch) {
    overall = Math.min(overall, 75);
  }

  // Determine level
  let level;
  if (overall >= 80) {
    level = 'high';
  } else if (overall >= 50) {
    level = 'medium';
  } else {
    level = 'low';
  }

  return { overall, level, issues };
}
