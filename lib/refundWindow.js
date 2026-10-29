// Pure helper (no dependencies) that decides whether a customer is still inside
// the 24-hour refund window. Kept separate from the Stripe code so it can be
// tested on its own. Time comes from Stripe's own charge timestamp, never from
// the customer's browser.

export const REFUND_WINDOW_MS = 24 * 60 * 60 * 1000;

// `charges` is the array returned by Stripe's charges list. Only the customer's
// most recent successful charge can be refunded, and only once.
export function findRefundableCharge(charges, nowMs = Date.now()) {
  const paid = (charges || [])
    .filter((c) => c && c.status === "succeeded" && c.paid && c.amount > 0)
    .sort((a, b) => b.created - a.created);
  const latest = paid[0];
  if (!latest) return null;
  if (latest.refunded || (latest.amount_refunded || 0) > 0) return null;
  const ageMs = nowMs - latest.created * 1000;
  if (ageMs < 0 || ageMs >= REFUND_WINDOW_MS) return null;
  return { charge: latest, msLeft: REFUND_WINDOW_MS - ageMs };
}
