// Helpers for businesses that manage more than one Google location.

// Which locations should be synced for this business?
// - New style: business.locations (everything found on Google) filtered by
//   business.selectedLocationIds (null/undefined = all of them).
// - Old style (accounts connected before multi-location support): just the
//   single accountId/locationId pair.
export function getSyncLocations(business) {
  const all = Array.isArray(business.locations) ? business.locations : [];
  if (all.length) {
    const sel = Array.isArray(business.selectedLocationIds) ? business.selectedLocationIds : null;
    const chosen = sel ? all.filter((l) => sel.includes(l.locationId)) : all;
    return chosen;
  }
  if (business.accountId && business.locationId) {
    return [{ accountId: business.accountId, locationId: business.locationId, title: business.locationTitle || null }];
  }
  return [];
}

// Where should a reply to this review be posted? Prefer the location stored on
// the review itself, then fall back to the business's primary location.
export function locationForReview(business, review) {
  if (review && review.locationId && review.accountId) {
    return { accountId: review.accountId, locationId: review.locationId };
  }
  return { accountId: business.accountId, locationId: business.locationId };
}

// Only allow redirects to Google-owned review links. Stops the short link from
// being usable as an open redirect to some other site.
export function isSafeReviewUrl(value) {
  try {
    const u = new URL(String(value));
    if (u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    return (
      h === "google.com" || h.endsWith(".google.com") ||
      h === "g.page" || h === "goo.gl" || h === "maps.app.goo.gl" || h === "g.co"
    );
  } catch {
    return false;
  }
}

// The link customers should be sent to, in priority order: one the owner typed
// in, then the link Google gave us for the first selected location.
export function getReviewUrl(business) {
  if (business.reviewLinkOverride && isSafeReviewUrl(business.reviewLinkOverride)) {
    return business.reviewLinkOverride;
  }
  const locs = getSyncLocations(business);
  const withUrl = locs.find((l) => l.reviewUrl && isSafeReviewUrl(l.reviewUrl));
  return withUrl ? withUrl.reviewUrl : null;
}

// Failure bookkeeping so one review that keeps failing (deleted on Google, a
// bad reply, etc.) doesn't get retried - and billed to Claude - every 15
// minutes. After 3 failures it sits out for 24 hours, then gets another try.
export function shouldSkipAfterFailures(entry, now = Date.now()) {
  if (!entry || entry.n < 3) return false;
  return now - new Date(entry.at).getTime() < 24 * 60 * 60 * 1000;
}
