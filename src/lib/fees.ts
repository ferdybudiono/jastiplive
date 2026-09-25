// Fee math for the 5% platform commission model.
//
// All amounts are INTEGER rupiah. The platform fee is rounded to the nearest
// rupiah and the streamer payout is DERIVED BY SUBTRACTION so that
// `platformFee + payout === amountBudget` always holds with zero drift
// (a DB CHECK constraint enforces the same invariant).

export interface FeeBreakdown {
  amountBudget: number;
  platformFee: number;
  payout: number;
  feePercent: number;
}

/**
 * Compute the fee split for an order.
 *
 * @param amountBudget total the viewer pays, in whole rupiah (positive integer)
 * @param feePercent   platform commission percentage (from the streamer's profile; default 5)
 */
export function computeFees(amountBudget: number, feePercent = 5): FeeBreakdown {
  if (!Number.isInteger(amountBudget) || amountBudget <= 0) {
    throw new Error("amountBudget must be a positive integer (whole rupiah)");
  }
  if (!(feePercent >= 0 && feePercent < 100)) {
    throw new Error("feePercent must be in the range [0, 100)");
  }

  const platformFee = Math.round((amountBudget * feePercent) / 100);
  const payout = amountBudget - platformFee; // derive by subtraction -> no drift

  return { amountBudget, platformFee, payout, feePercent };
}
