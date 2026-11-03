// Competitor tracking: the owner picks up to 5 nearby restaurants and sees their current Google rating
// and review count next to their own. Google's Places terms don't allow storing its content, so only the
// place IDs are saved; ratings are fetched live and kept in memory for an hour at most.

export const MAX_COMPETITORS = 5;
const CACHE_MS = 60 * 60 * 1000;
const cache = new Map(); // placeId -> { at, data }

const PLACE_ID_RE = /^[A-Za-z0-9_-]{10,200}$/;
export function isValidPlaceId(id) {
  return typeof id === "string" && PLACE_ID_RE.test(id);
}

function shape(p) {
  return {
    placeId: p.id,
    name: (p.displayName && p.displayName.text) || "Unknown place",
    address: p.formattedAddress || "",
    rating: typeof p.rating === "number" ? p.rating : null,
    count: typeof p.userRatingCount === "number" ? p.userRatingCount : null
  };
}

export async function searchCompetitors(query, area, apiKey) {
  const q = String(query || "").replace(/\s+/g, " ").trim().slice(0, 100);
  if (!q) return [];
  const textQuery = area ? `${q} in ${area}` : q;
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount"
    },
    body: JSON.stringify({ textQuery, includedType: "restaurant", pageSize: 5 })
  });
  if (!res.ok) throw new Error(`Places API error (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data.places || []).filter((p) => p.id).map(shape);
}

export async function fetchPlace(placeId, apiKey) {
  if (!isValidPlaceId(placeId)) throw new Error("Invalid place.");
  const hit = cache.get(placeId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "id,displayName,formattedAddress,rating,userRatingCount"
    }
  });
  if (!res.ok) throw new Error(`Places API error (${res.status})`);
  const data = shape(await res.json());
  if (cache.size > 500) cache.clear();
  cache.set(placeId, { at: Date.now(), data });
  return data;
}
