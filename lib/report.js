// Builds the "results report" numbers from data already on file - no AI calls.
// Pure and dependency-free so it can be tested on its own.

const STAR_VALUE = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
export const MINUTES_SAVED_PER_REPLY = 3; // a conservative estimate of time to write and post one reply

function round1(n) {
  return Math.round(n * 10) / 10;
}

// Which reviews belong to the period: those received since `sinceDate`.
export function buildResultsReport(business, sinceDate, periodLabel) {
  const all = Object.values(business.reviews || {});
  const inPeriod = all.filter((r) => r.createTime && new Date(r.createTime) >= sinceDate);

  const posted = inPeriod.filter((r) => r.status === "posted");
  // Replies posted by the app itself vs. ones the owner approved. Older records without
  // a "postedBy" tag are inferred from the star rating (4-5 stars were auto-posted).
  const autoReplies = posted.filter(
    (r) => r.postedBy === "auto" || (!r.postedBy && (r.starRating === "FOUR" || r.starRating === "FIVE"))
  ).length;
  const approvedReplies = posted.length - autoReplies;

  const minutesSaved = posted.length * MINUTES_SAVED_PER_REPLY;

  const history = business.ratingHistory || [];
  const latest = history[history.length - 1] || null;
  const previous = history.length > 1 ? history[history.length - 2] : null;
  const avgRating = latest
    ? latest.avgRating
    : inPeriod.length
    ? round1(inPeriod.reduce((s, r) => s + (STAR_VALUE[r.starRating] || 0), 0) / inPeriod.length)
    : null;
  const ratingChange = latest && previous ? round1(latest.avgRating - previous.avgRating) : null;

  // Best reviews to share with the team: 5-star with a real comment, newest first.
  const bestReviews = inPeriod
    .filter((r) => r.starRating === "FIVE" && (r.comment || "").trim().length >= 25)
    .sort((a, b) => new Date(b.createTime) - new Date(a.createTime))
    .slice(0, 3)
    .map((r) => ({ reviewer: r.reviewer || "A customer", comment: r.comment.trim().slice(0, 280) }));

  const lowReviews = inPeriod.filter((r) => r.starRating === "ONE" || r.starRating === "TWO");
  const lowHandled = lowReviews.filter((r) => r.status === "posted").length;
  const waiting = inPeriod.filter((r) => r.status === "pending_approval").length;

  return {
    periodLabel,
    businessName: business.businessName,
    reviewsReceived: inPeriod.length,
    repliesPosted: posted.length,
    autoReplies,
    approvedReplies,
    waitingForApproval: waiting,
    minutesSaved,
    hoursSavedText: minutesSaved >= 60 ? `${round1(minutesSaved / 60)} hours` : `${minutesSaved} minutes`,
    avgRating,
    ratingChange,
    bestReviews,
    needsAttention: {
      lowStarReviews: lowReviews.length,
      lowStarReplied: lowHandled
    }
  };
}
