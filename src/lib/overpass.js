import { TAG_SHOP_BOOKS } from './osm-tags.js';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// Below this zoom the bounding box spans too much of the world for Overpass
// to answer quickly. Gating avoids hammering a shared public instance.
export const MIN_OVERPASS_ZOOM = 6;

/**
 * Build an Overpass QL query for all `shop=books` elements (nodes, ways,
 * relations) within a bounding box. We want `out center` so ways/relations
 * come back with a plottable coordinate.
 * @param {[number, number, number, number]} bbox [south, west, north, east]
 */
export function buildShopQuery(bbox) {
  const [s, w, n, e] = bbox;
  const { key, value } = TAG_SHOP_BOOKS;
  return `[out:json][timeout:25];
(
  nwr["${key}"="${value}"](${s},${w},${n},${e});
);
out center tags;`;
}

/**
 * Fetch shop elements from Overpass for a bounding box.
 * Throws on HTTP failure; caller should catch and display a friendly message.
 * @param {[number, number, number, number]} bbox
 * @param {{signal?: AbortSignal}} [options]
 * @returns {Promise<Array<object>>} Overpass elements
 */
export async function fetchShopsInBbox(bbox, { signal } = {}) {
  const body = 'data=' + encodeURIComponent(buildShopQuery(bbox));
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    signal,
  });
  if (!res.ok) {
    throw new Error(`Overpass error ${res.status}`);
  }
  const data = await res.json();
  return Array.isArray(data?.elements) ? data.elements : [];
}

/**
 * Fetch a single element by OSM type + id. Used by the shop detail page.
 * @param {'node'|'way'|'relation'} type
 * @param {number|string} id
 */
export async function fetchShopById(type, id) {
  const query = `[out:json][timeout:25];
${type}(${id});
out center tags;`;
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    body: 'data=' + encodeURIComponent(query),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  if (!res.ok) throw new Error(`Overpass error ${res.status}`);
  const data = await res.json();
  return Array.isArray(data?.elements) && data.elements.length ? data.elements[0] : null;
}

/**
 * Geocode a free-text place query using Nominatim (OSM's search).
 * @param {string} query
 * @returns {Promise<{lat: number, lon: number, displayName: string} | null>}
 */
export async function geocode(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.[0]) return null;
  return {
    lat: parseFloat(data[0].lat),
    lon: parseFloat(data[0].lon),
    displayName: data[0].display_name,
  };
}
