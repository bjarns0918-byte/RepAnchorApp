import cron from "node-cron";
import { getAllBusinesses, getBusinessById as getBusinessFresh, updateBusiness, upsertReview, getReviewsSince, appendRatingSnapshot, withBusinessLock, backupDatabase } from "./store.js";
import { getValidAccessToken } from "./googleAuth.js";
import { fetchAllReviews, postReplyToReview } from "./googleReviews.js";
import { draftReply, draftAutoPostReply, buildDigest, extractMentions } from "./claude.js";
import { decideAutoPost } from "./replyRules.js";
import { buildResultsReport } from "./report.js";
import { sendEmail, sendUrgentReviewAlert } from "./emailer.js";
import { getSyncLocations, shouldSkipAfterFailures } from "./locations.js";

const AUTO_POST_STARS = ["FOUR", "FIVE"]; // 4-5 star reviews get auto-posted replies
const DRAFT_ONLY_STARS = ["ONE", "TWO", "THREE"]; // 1-3 star reviews wait for approval
const URGENT_ALERT_STARS = ["ONE", "TWO"]; // these get an instant email, not just the monthly digest

// Runs a review check for one business. Wrapped in a lock so this can't overlap
// with a manual "sync now" click (or another scheduled run) for the same
// business - see withBusinessLock in store.js for why that matters.
//
// "quick" checks (every 15 minutes) only look at the newest reviews on each
// location. A "full" check (nightly, or the Sync now button) looks at all of
// them, which also retries anything that failed earlier.
export async function syncOneBusiness(business, { full = true } = {}) {
  return withBusinessLock(business.id, () => syncOneBusinessUnlocked(business, { full }));
}

async function syncOneBusinessUnlocked(business, { full }) {
  const locations = getSyncLocations(business);
  if (!business.googleTokens || locations.length === 0) {
    return; // this business hasn't connected Google yet
  }

  const accessToken = await getValidAccessToken(business.googleTokens, (tokens) =>
    updateBusiness(business.id, { googleTokens: tokens })
  );

  const isHandled = (id) => {
    const r = business.reviews[id];
    return !!r && (r.status === "posted" || r.status === "pending_approval");
  };

  let autoPosted = 0;
  let drafted = 0;
  let checked = 0;
  let failures = 0;
  let locationsFailed = 0;
  const failureLog = { ...(getBusinessFresh(business.id)?.syncFailures || {}) };

  for (const loc of locations) {
    let reviews;
    try {
      reviews = await fetchAllReviews(accessToken, loc.accountId, loc.locationId, full ? null : isHandled);
    } catch (err) {
      failures++;
      locationsFailed++;
      console.error(`[sync] ${business.businessName} / ${loc.title || loc.locationId}: could not fetch reviews:`, err.message);
      continue; // one broken location shouldn't stop the others
    }
    checked += reviews.length;

    for (const incoming of reviews) {
      if (isHandled(incoming.reviewId)) continue;
      if (shouldSkipAfterFailures(failureLog[incoming.reviewId])) continue;

      const review = { ...incoming, accountId: loc.accountId, locationId: loc.locationId, locationTitle: loc.title || null };

      try {
        const decision = decideAutoPost(business, review);

        if (decision.auto) {
          const replyText = await draftAutoPostReply(review, business.businessName, business.replyTone, business);
          await postReplyToReview(accessToken, loc.accountId, loc.locationId, review.reviewId, replyText);
          upsertReview(business.id, {
            ...review,
            status: "posted",
            postedReply: replyText,
            postedAt: new Date().toISOString(),
            postedBy: "auto"
          });
          autoPosted++;
        } else if (DRAFT_ONLY_STARS.includes(review.starRating) || decision.reason) {
          // 1-3 star reviews always wait for the owner. A 4-5 star review also waits
          // if the owner chose "approve everything" or the review mentions something
          // sensitive (allergies, illness, legal threats, pests, and similar).
          const [opt1, opt2] = await draftReply(review, business.businessName, business.replyTone, business);
          upsertReview(business.id, {
            ...review,
            status: "pending_approval",
            draftReplies: [opt1, opt2],
            draftedAt: new Date().toISOString(),
            heldReason: decision.reason || null
          });
          drafted++;
          const needsAlert = URGENT_ALERT_STARS.includes(review.starRating) || decision.reason === "sensitive";
          if (needsAlert && business.notifyUrgentReviews !== false) {
            await sendUrgentReviewAlert(business, review);
          }
        }
        delete failureLog[review.reviewId];
      } catch (err) {
        failures++;
        const prev = failureLog[review.reviewId];
        failureLog[review.reviewId] = { n: (prev ? prev.n : 0) + 1, at: new Date().toISOString() };
        console.error(`[sync] ${business.businessName}: review ${review.reviewId} failed (try ${failureLog[review.reviewId].n}):`, err.message);
      }
    }
  }

  // Forget bookkeeping for reviews that are now handled, so this doesn't grow forever.
  for (const id of Object.keys(failureLog)) {
    if (isHandled(id)) delete failureLog[id];
  }
  if (locationsFailed === locations.length) {
    updateBusiness(business.id, { syncFailures: failureLog });
    throw new Error("Couldn't reach Google to check reviews - see server logs.");
  }
  updateBusiness(business.id, { lastSyncedAt: new Date().toISOString(), syncFailures: failureLog });

  console.log(
    `[sync] ${business.businessName} (${full ? "full" : "quick"}, ${locations.length} location${locations.length === 1 ? "" : "s"}): ` +
      `checked ${checked} reviews, auto-posted ${autoPosted}, drafted ${drafted}, failures ${failures}.`
  );
}

let syncRunning = false;
export async function syncAllBusinesses({ full = true } = {}) {
  if (syncRunning) {
    console.log("[sync] previous run still going - skipping this one.");
    return;
  }
  syncRunning = true;
  try {
    // Only businesses with an active subscription/trial. Canceled or unpaid accounts
    // must never get replies posted (or AI usage billed) on their behalf.
    const businesses = getAllBusinesses().filter((b) => b.subscriptionStatus === "active");
    for (const business of businesses) {
      try {
        await syncOneBusiness(business, { full });
      } catch (err) {
        console.error(`[sync] failed for ${business.businessName}:`, err.message);
      }
    }
  } finally {
    syncRunning = false;
  }
}

// Posts an approved reply for a review that was left as a draft (1-3 stars).
export async function postApprovedReply(accessToken, accountId, locationId, businessId, reviewId, replyText) {
  await postReplyToReview(accessToken, accountId, locationId, reviewId, replyText);
  upsertReview(businessId, {
    reviewId,
    status: "posted",
    postedReply: replyText,
    postedAt: new Date().toISOString(),
    postedBy: "owner"
  });
}


function escapeHtml(text) {
  return String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderMentionsHtml(mentions) {
  if (!mentions || (!mentions.people.length && !mentions.dishes.length)) return "";
  const line = (items) => items.map((m) => `${escapeHtml(m.name)} (${m.mentions})`).join(", ");
  return `
    <p><strong>Shout-outs:</strong>
      ${mentions.people.length ? `Team members customers named: ${line(mentions.people)}. ` : ""}
      ${mentions.dishes.length ? `Items customers named: ${line(mentions.dishes)}.` : ""}
    </p>`;
}

function renderResultsHtml(report) {
  const change =
    report.ratingChange === null || report.ratingChange === 0
      ? ""
      : ` (${report.ratingChange > 0 ? "up" : "down"} ${Math.abs(report.ratingChange)} from last period)`;
  return `
    <div style="background:#F5F6F2; border-radius:8px; padding:14px 16px; margin:18px 0;">
      <p style="margin:0 0 8px; font-weight:700;">Your results with RepAnchor</p>
      <p style="margin:0; font-size:14px; line-height:1.6;">
        ${report.repliesPosted} repl${report.repliesPosted === 1 ? "y" : "ies"} posted
        (${report.autoReplies} automatic, ${report.approvedReplies} approved by you)<br>
        About ${report.hoursSavedText} of your time saved<br>
        Average rating: ${report.avgRating === null ? "n/a" : report.avgRating + " / 5"}${change}
      </p>
      <p style="margin:10px 0 0; font-size:13px;"><a href="${process.env.BASE_URL || ""}/report.html">View your full report</a></p>
    </div>`;
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

  // Shout-outs (staff and dishes people name) are a nice-to-have - never block the digest on them.
  let mentions = null;
  try {
    mentions = await extractMentions(recentReviews, business.businessName);
    updateBusiness(business.id, { latestMentions: { ...mentions, label: periodLabel, date: new Date().toISOString() } });
  } catch (err) {
    console.error(`[digest] shout-outs failed for ${business.businessName}:`, err.message);
  }

  const report = buildResultsReport(getBusinessFresh(business.id), sinceDate, periodLabel);

  const periodText = frequency === "weekly" ? "the last 7 days" : "the last 30 days";
  const html = `
    <h2>${business.businessName} — ${frequency === "weekly" ? "Weekly" : "Monthly"} Review Digest</h2>
    <p><strong>What's working:</strong> ${digest.strengths}</p>
    <p><strong>Needs improvement:</strong> ${digest.improvements}</p>
    ${renderMentionsHtml(mentions)}
    ${renderResultsHtml(report)}
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

  // Every 15 minutes: quick check for brand-new reviews, so bad reviews reach
  // the owner within minutes instead of the next morning.
  cron.schedule("*/15 * * * *", () => {
    syncAllBusinesses({ full: false }).catch((err) => console.error("[sync] failed:", err.message));
  });

  // Every day at 8am server time: a full pass over every review, which also
  // retries anything that failed earlier.
  cron.schedule("5 8 * * *", () => {
    syncAllBusinesses({ full: true }).catch((err) => console.error("[sync] failed:", err.message));
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
