// Handles Stripe Checkout (the $35/month payment page) and the webhook that
// tells us when a payment succeeds or a subscription is canceled.

import Stripe from "stripe";
import { findRefundableCharge } from "./refundWindow.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

export async function createCheckoutSession(business) {
  const priceId =
    business.billingPlan === "annual"
      ? process.env.STRIPE_PRICE_ID_ANNUAL
      : process.env.STRIPE_PRICE_ID_MONTHLY;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: 7
    },
    customer_email: business.email,
    client_reference_id: business.id,
    success_url: `${process.env.BASE_URL}/?checkout=success`,
    cancel_url: `${process.env.BASE_URL}/signup.html?checkout=cancelled`
  });
  return session.url;
}

export function verifyWebhookSignature(rawBody, signature) {
  return stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
}

// Lets a customer manage or cancel their own subscription through Stripe's
// hosted portal - no custom cancellation UI needed. Requires the "Customer
// portal" to be turned on once in the Stripe dashboard (Settings -> Billing
// -> Customer portal - just a toggle, no code needed).
export async function createPortalSession(business) {
  if (!business.stripeCustomerId) {
    throw new Error("No billing account found yet - complete checkout first.");
  }
  const session = await stripe.billingPortal.sessions.create({
    customer: business.stripeCustomerId,
    return_url: `${process.env.BASE_URL}/`
  });
  return session.url;
}

// Cancels at the end of the current billing period rather than instantly -
// the customer keeps access through what they already paid for, and it
// simply won't renew. The existing webhook handler flips their local
// subscriptionStatus to "canceled" automatically once Stripe actually ends it.
export async function cancelSubscriptionAtPeriodEnd(business) {
  if (!business.stripeSubscriptionId) {
    throw new Error("No active subscription found to cancel.");
  }
  const subscription = await stripe.subscriptions.update(business.stripeSubscriptionId, {
    cancel_at_period_end: true
  });
  return subscription;
}

// Used when someone deletes their whole account - cancels right away rather
// than waiting for period end, since there's no account left to keep access to.
export async function cancelSubscriptionImmediately(business) {
  if (!business.stripeSubscriptionId) return;
  try {
    await stripe.subscriptions.cancel(business.stripeSubscriptionId);
  } catch (err) {
    console.error(`[stripe] Failed to immediately cancel subscription for ${business.email}:`, err.message);
  }
}

// --- Automatic 24-hour refunds ---
// Looks up the customer's most recent charge straight from Stripe and returns it
// only if it is still inside the 24-hour window and hasn't been refunded.
export async function getRefundableCharge(business) {
  if (!business.stripeCustomerId) return null;
  const list = await stripe.charges.list({ customer: business.stripeCustomerId, limit: 5 });
  return findRefundableCharge(list.data);
}

// Refunds the full amount of the latest charge, then ends the subscription right
// away so the customer isn't billed again. The idempotency key makes a double
// click (or a retry) refund the same charge only once.
export async function refundLatestChargeAndCancel(business) {
  const found = await getRefundableCharge(business);
  if (!found) {
    throw new Error("You're no longer inside the 24-hour refund window for your latest payment.");
  }
  await stripe.refunds.create(
    {
      charge: found.charge.id,
      reason: "requested_by_customer",
      metadata: { businessId: business.id }
    },
    { idempotencyKey: `repanchor_refund_${found.charge.id}` }
  );
  if (business.stripeSubscriptionId) {
    try {
      await stripe.subscriptions.cancel(business.stripeSubscriptionId);
    } catch (err) {
      console.error(`[stripe] Refund succeeded but canceling subscription failed for ${business.email}:`, err.message);
    }
  }
  return found.charge;
}

export { stripe };
