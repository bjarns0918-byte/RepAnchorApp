import cron from "node-cron";
import { getAllBusinesses, updateBusiness, upsertReview, getReviewsSince, appendRatingSnapshot, withBusinessLock, backupDatabase } from "./store.js";
import { getValidAccessToken } from "./googleAuth.js";
import { fetchAllReviews, postReplyToReview } from "./googleReviews.js";
import { draftReply, draftAutoPostReply, buildDigest } from "./claude.js";
import { sendEmail, sendUrgentReviewAlert } from "./emailer.js";

const AUTO_POST_STARS = ["FOUR", "FIVE"]; // 4-5 star reviews get auto-posted replies
const DRAFT_ONLY_STARS = ["ONE", "TWO", "THREE"]; // 1-3 star reviews wait for approval
const URGENT_ALERT_STARS = ["ONE", "TWO"]; // these get an instant email, not just the monthly digest

// Runs the daily review check for one business. Wrapped in a lock so this
// can't overlap with a manual "sync now" click (or another scheduled run)
// for the same business - see withBusinessLock in store.js for why that matters.
export async function syncOneBusiness(business) {
  return withBusinessLock(business.id, () => syncOneBusinessUnlocked(business));
}

async function syncOneBusinessUnlocked(business) {
  if (!business.googleTokens || !business.accountId || !business.locationId) {
    return; // this business hasn't connected Google yet
  }

  const accessToken = await getValidAccessToken(business.googleTokens, (tokens) =>
    updateBusiness(business.id, { googleTokens: tokens })
  );
  const reviews = await fetchAllReviews(accessToken, business.accountId, business.locationId);

  let autoPosted = 0;
  let drafted = 0;

  for (const review of reviews) {
    const alreadyHandled = business.reviews[review.reviewId];
    if (alreadyHandled && (alreadyHandled.status === "posted" || alreadyHandled.status === "pending_approval")) {
      continue;
    }

    if (AUTO_POST_STARS.includes(review.starRating)) {
      const replyText = await draftAutoPostReply(review, business.businessName, business.replyTone);
      await postReplyToReview(accessToken, business.accountId, business.locationId, review.reviewId, replyText);
      upsertReview(business.id, {
        ...review,
        status: "posted",
        postedReply: replyText,
        postedAt: new Date().toISOString()
      });
      autoPosted++;
    } else if (DRAFT_ONLY_STARS.includes(review.starRating)) {
      const [opt1, opt2] = await draftReply(review, business.businessName, business.replyTone);
      upsertReview(business.id, {
        ...review,
        status: "pending_approval",
        draftReplies: [opt1, opt2],
        draftedAt: new Date().toISOString()
      });
      drafted++;
      if (URGENT_ALERT_STARS.includes(review.starRating) && business.notifyUrgentReviews !== false) {
        await sendUrgentReviewAlert(business, review);
      }
    }
  }

  updateBusiness(business.id, { lastSyncedAt: new Date().toISOString() });

  console.log(
    `[sync] ${business.businessName}: checked ${reviews.length} reviews, auto-posted ${autoPosted}, drafted ${drafted}.`
  );
}

export async function syncAllBusinesses() {
  const businesses = getAllBusinesses();
  for (const business of businesses) {
    try {
      await syncOneBusiness(business);
    } catch (err) {
      console.error(`[sync] failed for ${business.businessName}:`, err.message);
    }
  }
}

// Posts an approved reply for a review that was left as a draft (1-3 stars).
export async function postApprovedReply(accessToken, accountId, locationId, businessId, reviewId, replyText) {
  await postReplyToReview(accessToken, accountId, locationId, reviewId, replyText);
  upsertReview(businessId, {
    reviewId,
    status: "posted",
    postedReply: replyText,
    postedAt: new Date().toISOString()
  });
}

// Builds and emails the monthly digest for one business.
export async function runDigestForBusiness(business) {
  return withBusinessLock(business.id, () => runDigestForBusinessUnlocked(business));
}

async function runDigestForBusinessUnlocked(business) {
  const frequency = business.digestFrequency === "weekly" ? "weekly" : "monthly";
  const lookbackDays = frequency === "weekly" ? 7 : 30;
  const sinceDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const recentReviews = getReviewsSince(business.id, sinceDate);

  if (recentReviews.length === 0) return;

  const digest = await buildDigest(recentReviews, business.businessName);

  const starValue = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
  const avgRating =
    Math.round(
      (recentReviews.reduce((sum, r) => sum + (starValue[r.starRating] || 0), 0) / recentReviews.length) * 10
    ) / 10;
  const periodLabel =
    frequency === "weekly"
      ? `Week of ${new Date(sinceDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
      : new Date().toLocaleString("en-US", { month: "short", year: "numeric" });
  appendRatingSnapshot(business.id, {
    label: periodLabel,
    avgRating,
    reviewCount: recentReviews.length,
    date: new Date().toISOString()
  });
  updateBusiness(business.id, { latestDigest: digest });

  const periodText = frequency === "weekly" ? "the last 7 days" : "the last 30 days";
  const html = `
    <h2>${business.businessName} — ${frequency === "weekly" ? "Weekly" : "Monthly"} Review Digest</h2>
    <p><strong>What's working:</strong> ${digest.strengths}</p>
    <p><strong>Needs improvement:</strong> ${digest.improvements}</p>
    <p style="color:#888;font-size:12px;">Based on ${recentReviews.length} review(s) from ${periodText}. Average rating: ${avgRating} / 5.</p>
  `;
  await sendEmail(business.email, `${business.businessName}: Your ${frequency} review digest`, html);
  console.log(`[digest] Sent ${frequency} digest to ${business.email}.`);
}

export async function runDigestForAllBusinesses(frequency) {
  const businesses = getAllBusinesses().filter(
    (b) => b.subscriptionStatus === "active" && (b.digestFrequency === "weekly" ? "weekly" : "monthly") === frequency
  );
  for (const business of businesses) {
    try {
      await runDigestForBusiness(business);
    } catch (err) {
      console.error(`[digest] failed for ${business.businessName}:`, err.message);
    }
  }
}

export function startScheduler() {
  // Every day at 7:45am server time: back up the database before anything
  // else runs, so there's always a recent recovery point.
  cron.schedule("45 7 * * *", () => {
    try {
      backupDatabase();
    } catch (err) {
      console.error("[backup] failed:", err.message);
    }
  });

  // Every day at 8am server time: check every connected business for new reviews.
  cron.schedule("0 8 * * *", () => {
    syncAllBusinesses().catch((err) => console.error("[sync] failed:", err.message));
  });

  // Every Sunday at 8am: send businesses who chose weekly digests theirs.
  cron.schedule("0 8 * * 0", () => {
    runDigestForAllBusinesses("weekly").catch((err) => console.error("[digest] weekly run failed:", err.message));
  });

  // 1st of every month at 8am: send businesses who chose monthly digests theirs.
  cron.schedule("0 8 1 * *", () => {
    runDigestForAllBusinesses("monthly").catch((err) => console.error("[digest] monthly run failed:", err.message));
  });

  // Also back up once immediately on startup, so a fresh deploy has a backup
  // point right away rather than waiting for the next 7:45am run.
  try {
    backupDatabase();
  } catch (err) {
    console.error("[backup] initial backup failed:", err.message);
  }

  console.log("Scheduler started: daily backup at 7:45am, daily review sync at 8am, weekly digests on Sundays, monthly digests on the 1st, all at 8am.");
}
