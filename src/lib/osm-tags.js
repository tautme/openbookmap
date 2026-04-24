/**
 * OSM tag constants used when building Overpass queries or interpreting
 * Overpass responses. Keep tag strings in this file; comments link to the
 * OSM wiki so future maintainers can see the definition.
 */

// shop=books — a shop selling books.
// https://wiki.openstreetmap.org/wiki/Tag:shop%3Dbooks
export const TAG_SHOP_BOOKS = { key: 'shop', value: 'books' };

// second_hand=* — indicates whether a shop sells second-hand goods.
// https://wiki.openstreetmap.org/wiki/Key:second_hand
export const TAG_SECOND_HAND = 'second_hand';

/**
 * Build an "address-like" display string from OSM address tags.
 * Falls back to an empty string when no address tags are present.
 * @param {Record<string, string>} tags
 */
export function formatOsmAddress(tags = {}) {
  return [tags['addr:street'], tags['addr:city'], tags['addr:country']].filter(Boolean).join(', ');
}

/**
 * Pick the best "name" for a shop from its OSM tags.
 * Order of preference matches what the OSM data model suggests.
 * @param {Record<string, string>} tags
 * @param {string} fallback
 */
export function pickName(tags = {}, fallback = 'Unnamed bookstore') {
  return tags.name || tags['name:en'] || tags.brand || fallback;
}

/**
 * Pick the best website URL, if any.
 * @param {Record<string, string>} tags
 */
export function pickWebsite(tags = {}) {
  return tags.website || tags['contact:website'] || '';
}

/**
 * True if the OSM element has coordinates we can plot (either directly
 * for nodes or on a `.center` for ways/relations with `out center`).
 * @param {{lat?: number, lon?: number, center?: {lat: number, lon: number}}} el
 */
export function getLatLon(el) {
  const lat = el?.lat ?? el?.center?.lat;
  const lon = el?.lon ?? el?.center?.lon;
  if (lat == null || lon == null) return null;
  return { lat, lon };
}
