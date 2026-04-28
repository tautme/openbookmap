import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/components.css';
import '../styles/map.css';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

import L from 'leaflet';
import 'leaflet.markercluster';

import { mountTopbar } from '../components/topbar.js';
import { renderShopPanel } from '../components/shop-panel.js';
import { fetchShopsInBbox, geocode, MIN_OVERPASS_ZOOM, fetchShopById } from '../lib/overpass.js';
import { getLatLon, pickName } from '../lib/osm-tags.js';
import { readMapState, writeMapState } from '../lib/url-state.js';
import { strings } from '../lib/strings.js';
import { installAnalytics } from '../lib/analytics.js';

installAnalytics();
mountTopbar({ active: 'map' });

// ——— Map setup ————————————————————————————————————————————————
const initial = readMapState();
const startLat = initial.lat ?? 20;
const startLon = initial.lon ?? 0;
const startZoom = initial.z ?? 2;

const map = L.map('map', { zoomControl: true, worldCopyJump: true }).setView(
  [startLat, startLon],
  startZoom,
);

// CartoDB Positron — clean grayscale basemap, free, CDN-backed.
// https://github.com/CartoDB/basemap-styles
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  maxZoom: 19,
  subdomains: 'abcd',
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a> · OpenBookMap',
}).addTo(map);

const cluster = L.markerClusterGroup({ maxClusterRadius: 50, showCoverageOnHover: false });
map.addLayer(cluster);

const bookIcon = L.divIcon({
  className: '',
  html: '<div class="book-marker">📖</div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

// ——— State ————————————————————————————————————————————————————
/** @type {Map<string, L.Marker>} key is "type/id" */
const loadedShops = new Map();
/** @type {Map<string, object>} OSM element cache by "type/id" */
const elementsByKey = new Map();
let fetchTimer = null;
let inflight = null; // AbortController for Overpass

const countEl = document.getElementById('shop-count');
const loadingEl = document.getElementById('loading');
const panel = document.getElementById('panel');
const panelInner = document.getElementById('panel-inner');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');

// ——— Fetch shops when the map moves ———————————————————————————————
function setLoading(on) {
  loadingEl?.classList.toggle('show', on);
}

async function fetchShopsInView() {
  if (map.getZoom() < MIN_OVERPASS_ZOOM) {
    countEl.textContent = strings.map.zoomIn;
    return;
  }
  if (inflight) inflight.abort();
  inflight = new AbortController();
  const b = map.getBounds();
  const bbox = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()];
  setLoading(true);
  try {
    const elements = await fetchShopsInBbox(bbox, { signal: inflight.signal });
    let added = 0;
    for (const el of elements) {
      const key = `${el.type}/${el.id}`;
      if (loadedShops.has(key)) continue;
      const coords = getLatLon(el);
      if (!coords) continue;
      const marker = L.marker([coords.lat, coords.lon], { icon: bookIcon });
      marker.bindTooltip(pickName(el.tags, strings.map.unnamed), {
        direction: 'top',
        offset: [0, -8],
      });
      marker.on('click', () => openShopPanel(el));
      cluster.addLayer(marker);
      loadedShops.set(key, marker);
      elementsByKey.set(key, el);
      added++;
    }
    countEl.textContent = strings.map.shopCount(loadedShops.size, added);
  } catch (err) {
    if (err?.name === 'AbortError') return;
    console.error('Overpass failed:', err);
    countEl.textContent = strings.map.fetchFailed;
  } finally {
    setLoading(false);
  }
}

map.on('moveend', () => {
  const c = map.getCenter();
  writeMapState({ lat: c.lat, lon: c.lng, z: map.getZoom() });
  clearTimeout(fetchTimer);
  fetchTimer = setTimeout(fetchShopsInView, 700);
});

// Kick off an initial fetch once the map tiles settle.
if (map.getZoom() >= MIN_OVERPASS_ZOOM) {
  fetchShopsInView();
} else {
  countEl.textContent = strings.map.zoomIn;
}

// ——— Panel ————————————————————————————————————————————————————
document.getElementById('panel-close').addEventListener('click', () => {
  panel.classList.remove('open');
  writeMapState({ shop: null });
});

async function openShopPanel(osmElement) {
  await renderShopPanel(panelInner, osmElement);
  panel.classList.add('open');
  writeMapState({ shop: { type: osmElement.type, id: osmElement.id } });
}

// Deep-link: if `?shop=type/id` is in the URL, open it on load.
async function maybeOpenDeepLink() {
  if (!initial.shop) return;
  const key = `${initial.shop.type}/${initial.shop.id}`;
  let el = elementsByKey.get(key);
  if (!el) {
    try {
      el = await fetchShopById(initial.shop.type, initial.shop.id);
    } catch (err) {
      console.error('Could not load shared shop:', err);
    }
  }
  if (!el) return;
  const coords = getLatLon(el);
  if (coords) map.setView([coords.lat, coords.lon], Math.max(map.getZoom(), 15));
  openShopPanel(el);
}
maybeOpenDeepLink();

// ——— Search (geocode via Nominatim) ——————————————————————————————
searchBtn.addEventListener('click', doSearch);
searchInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') doSearch();
});

async function doSearch() {
  const q = searchInput.value.trim();
  if (!q) return;
  searchBtn.disabled = true;
  try {
    const hit = await geocode(q);
    if (hit) {
      map.setView([hit.lat, hit.lon], 13);
    } else {
      alert(strings.map.cityNotFound(q));
    }
  } catch {
    alert(strings.map.searchFailed);
  } finally {
    searchBtn.disabled = false;
  }
}
