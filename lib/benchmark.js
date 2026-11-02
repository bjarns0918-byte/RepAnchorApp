// "How you compare" - compares a restaurant's rating to nearby restaurants using
// Google's Places API. Only anonymous aggregate numbers are kept (no competitor
// names), and results are cached for 7 days to keep API usage small.
// Requires GOOGLE_PLACES_API_KEY (Places API (New) enabled in Google Cloud).

export const BENCHMARK_CACHE_MS = 7 * 24 * 60 * 60 * 1000;

// `places` is the list returned by Places searchText (rating + userRatingCount).
export function computeBenchmarkStats(places) {
  const rated = (places || []).filter((p) => typeof p.rating === "number" && p.userRatingCount > 0);
  if (rated.length < 3) return null; // too few to be meaningful
  const ratings = rated.map((p) => p.rating).sort((a, b) => a - b);
  const counts = rated.map((p) => p.userRatingCount).sort((a, b) => a - b);
  const mid = (arr) => (arr.length % 2 ? arr[(arr.length - 1) / 2] : (arr[arr.length / 2 - 1] + arr[arr.length / 2]) / 2);
  const avg = ratings.reduce((s, r) => s + r, 0) / ratings.length;
  return {
    n: rated.length,
    avgRating: Math.round(avg * 10) / 10,
    medianRating: Math.round(mid(ratings) * 10) / 10,
    medianReviewCount: Math.round(mid(counts)),
    ratings // sorted, used to place the business among its neighbors
  };
}

// Places the business among the nearby sample.
export function compareToArea(stats, yourRating) {
  if (!stats || typeof yourRating !== "number") return null;
  const below = stats.ratings.filter((r) => r < yourRating).length;
  const equal = stats.ratings.filter((r) => r === yourRating).length;
  const percentile = Math.round(((below + equal / 2) / stats.ratings.length) * 100);
  return {
    percentile, // "you rate higher than X% of nearby restaurants"
    diff: Math.round((yourRating - stats.avgRating) * 10) / 10
  };
}

export async function fetchAreaPlaces(area, apiKey) {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.rating,places.userRatingCount"
    },
    body: JSON.stringify({ textQuery: `restaurants in ${area}`, includedType: "restaurant", pageSize: 20 })
  });
  if (!res.ok) {
    throw new Error(`Places API error (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  const data = await res.json();
  return data.places || [];
}
