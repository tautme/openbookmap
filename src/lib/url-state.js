/**
 * Read and write map state to the URL, so links like
 *   /map?lat=48.85&lon=2.35&z=13&shop=node/123
 * are shareable and survive a page reload.
 */

/**
 * Parse the map state from `location.search`.
 * Invalid numbers are returned as null rather than NaN.
 * @param {string} [search=location.search]
 */
export function readMapState(search = location.search) {
  const p = new URLSearchParams(search);
  const lat = numOrNull(p.get('lat'));
  const lon = numOrNull(p.get('lon'));
  const z = intOrNull(p.get('z'));
  const shop = parseShopRef(p.get('shop'));
  return { lat, lon, z, shop };
}

/**
 * Update location.search (without a page reload) to reflect map state.
 * Uses `history.replaceState` so we don't pollute the back stack on every pan.
 */
export function writeMapState({ lat, lon, z, shop } = {}) {
  const p = new URLSearchParams(location.search);
  if (lat != null) p.set('lat', lat.toFixed(4));
  if (lon != null) p.set('lon', lon.toFixed(4));
  if (z != null) p.set('z', String(z));
  if (shop) {
    p.set('shop', `${shop.type}/${shop.id}`);
  } else if (shop === null) {
    p.delete('shop');
  }
  const qs = p.toString();
  const next = `${location.pathname}${qs ? '?' + qs : ''}${location.hash}`;
  history.replaceState(null, '', next);
}

/**
 * Parse a `type/id` shop ref like "node/12345".
 * @param {string|null} str
 * @returns {{type: 'node'|'way'|'relation', id: string} | null}
 */
export function parseShopRef(str) {
  if (!str) return null;
  const parts = String(str).split('/');
  if (parts.length !== 2) return null;
  const [type, id] = parts;
  if (!['node', 'way', 'relation'].includes(type)) return null;
  if (!id || !/^\d+$/.test(id)) return null;
  return { type, id };
}

function numOrNull(s) {
  if (s == null || s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function intOrNull(s) {
  if (s == null || s === '') return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}
