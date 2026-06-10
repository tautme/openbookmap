// Bookstores KISS POC — surfaces every shop=books on OSM in the visible
// bbox, categorizes by tags, and lets you flip a filter switch to focus
// on used / indie / chain. Confirms the main app's existing Overpass
// query is *already* catching all bookstores; this prototype makes the
// category split visible.

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const MIN_ZOOM = 6;
const FETCH_DEBOUNCE_MS = 700;

// ---- state -------------------------------------------------------------

const state = {
  map: null,
  layerGroup: null, // L.LayerGroup of all current markers
  markers: [], // [{el, marker, category}] for filter toggles
  abortController: null,
  fetchTimer: null,
  lastBboxKey: null,
  currentFilter: 'all',
};

// ---- DOM ---------------------------------------------------------------

const el = (id) => document.getElementById(id);
const dom = {
  map: el('map'),
  status: el('status'),
  searchForm: el('searchForm'),
  searchInput: el('searchInput'),
  legend: el('legend'),
  legendUsed: el('legendUsed'),
  legendIndie: el('legendIndie'),
  legendChain: el('legendChain'),
  legendUnknown: el('legendUnknown'),
};

// ---- categorization ----------------------------------------------------

// Mutually exclusive bins so marker color = category, and the filter
// radio + counts line up with what the user sees on the map.
// Priority order (used wins over chain wins over indie) matches what a
// book-discovery user cares about most: that a place sells used books at
// all, then whether it's an independent business.
function categorize(tags) {
  if (!tags) return 'unknown';
  const sh = (tags.second_hand || '').toLowerCase();
  if (sh === 'yes' || sh === 'only') return 'used';
  const hasBrand = Boolean(tags['brand:wikidata'] || tags.brand);
  if (hasBrand) return 'chain';
  // Treat plain shop=books with a name as indie. Without a name we have
  // less evidence it's a real business; flag as unknown.
  if (tags.name || tags['name:en']) return 'indie';
  return 'unknown';
}

const CATEGORY_COLOR = {
  used: '#f59e0b',
  indie: '#22c55e',
  chain: '#6366f1',
  unknown: '#6b7280',
};

// Small SVG circle as a DivIcon — keeps the prototype dependency-light
// (no marker-cluster, no image assets).
function dotIcon(category) {
  const color = CATEGORY_COLOR[category];
  const html = `<span style="
    display:block;
    width:14px;height:14px;
    background:${color};
    border:2px solid #0b0b0d;
    border-radius:50%;
    box-shadow:0 0 0 1px ${color}55;
  "></span>`;
  return L.divIcon({
    html,
    className: '',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

// ---- Overpass ----------------------------------------------------------

function buildQuery(bbox) {
  const [s, w, n, e] = bbox;
  // Matches src/lib/overpass.js: nwr["shop"="books"] (all geometry types
  // with center coords). KISS — no second_hand / brand filters at query
  // time; everything is filtered client-side so flipping the radio is
  // instant and we cache one fetch per bbox.
  return `[out:json][timeout:25];
nwr["shop"="books"](${s},${w},${n},${e});
out center tags;`;
}

async function fetchBookstores(bbox) {
  // Cancel any in-flight request — the bbox we cared about has changed.
  state.abortController?.abort();
  const ac = new AbortController();
  state.abortController = ac;

  const query = buildQuery(bbox);
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    body: 'data=' + encodeURIComponent(query),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    signal: ac.signal,
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  const data = await res.json();
  return Array.isArray(data?.elements) ? data.elements : [];
}

function elementLatLon(el) {
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null) return null;
  return { lat, lon };
}

// ---- render ------------------------------------------------------------

function escapeHtml(s) {
  return String(s ?? '').replace(
    /[<>&"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c],
  );
}

function popupHtml(element, category) {
  const tags = element.tags || {};
  const name = tags.name || tags['name:en'] || tags.brand || 'Unnamed bookstore';
  const addrParts = [tags['addr:housenumber'], tags['addr:street']]
    .filter(Boolean)
    .join(' ');
  const addr = [addrParts, tags['addr:city'], tags['addr:country']]
    .filter(Boolean)
    .join(', ');
  const website = tags.website || tags['contact:website'] || '';
  const osmUrl = `https://www.openstreetmap.org/${element.type}/${element.id}`;
  const sh = tags.second_hand;

  const badges = [];
  if (sh === 'yes' || sh === 'only') {
    badges.push(`<span class="tag used">used (${escapeHtml(sh)})</span>`);
  } else if (sh === 'no') {
    badges.push(`<span class="tag">new only</span>`);
  }
  if (tags['brand:wikidata']) {
    badges.push(
      `<span class="tag chain">chain · ${escapeHtml(tags.brand || tags['brand:wikidata'])}</span>`,
    );
  } else {
    badges.push(`<span class="tag indie">indie</span>`);
  }

  return `
    <h3>${escapeHtml(name)}</h3>
    ${addr ? `<div>${escapeHtml(addr)}</div>` : ''}
    ${website ? `<div><a href="${escapeHtml(website)}" target="_blank" rel="noopener">${escapeHtml(website)}</a></div>` : ''}
    <div class="tags">${badges.join('')}</div>
    <div style="margin-top:8px;font-size:0.75rem"><a href="${osmUrl}" target="_blank" rel="noopener">OSM ${element.type}/${element.id}</a> · category: <strong>${category}</strong></div>
  `;
}

function renderResults(elements) {
  state.layerGroup.clearLayers();
  state.markers = [];

  const counts = { used: 0, indie: 0, chain: 0, unknown: 0 };
  let plotted = 0;
  for (const el of elements) {
    const ll = elementLatLon(el);
    if (!ll) continue;
    const category = categorize(el.tags);
    counts[category]++;
    const marker = L.marker([ll.lat, ll.lon], { icon: dotIcon(category) });
    marker.bindPopup(() => popupHtml(el, category), {
      maxWidth: 280,
      autoPan: true,
    });
    state.markers.push({ el, marker, category });
    plotted++;
  }
  applyFilter(state.currentFilter);

  dom.legend.hidden = plotted === 0;
  dom.legendUsed.textContent = counts.used;
  dom.legendIndie.textContent = counts.indie;
  dom.legendChain.textContent = counts.chain;
  dom.legendUnknown.textContent = counts.unknown;

  setStatus(
    plotted === 0
      ? 'No bookstores in view'
      : `${plotted} bookstore${plotted === 1 ? '' : 's'} in view`,
  );
}

function applyFilter(filter) {
  state.currentFilter = filter;
  state.layerGroup.clearLayers();
  for (const m of state.markers) {
    if (filter === 'all' || m.category === filter) {
      m.marker.addTo(state.layerGroup);
    }
  }
}

// ---- map wiring --------------------------------------------------------

function setStatus(text, isError = false) {
  dom.status.textContent = text;
  dom.status.classList.toggle('error', !!isError);
}

function bboxFromMap(map) {
  const b = map.getBounds();
  return [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()];
}

function bboxKey(bbox) {
  // 4 decimals ≈ 11 m precision — plenty to dedupe tiny pan jitters.
  return bbox.map((n) => n.toFixed(4)).join(',');
}

function scheduleFetch() {
  clearTimeout(state.fetchTimer);
  if (state.map.getZoom() < MIN_ZOOM) {
    setStatus(`Zoom in to load bookstores (need zoom ≥ ${MIN_ZOOM})`);
    state.layerGroup.clearLayers();
    state.markers = [];
    dom.legend.hidden = true;
    return;
  }
  state.fetchTimer = setTimeout(runFetch, FETCH_DEBOUNCE_MS);
}

async function runFetch() {
  const bbox = bboxFromMap(state.map);
  const key = bboxKey(bbox);
  if (key === state.lastBboxKey) return;
  state.lastBboxKey = key;
  setStatus('Loading…');
  try {
    const elements = await fetchBookstores(bbox);
    renderResults(elements);
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error(err);
    setStatus(`Overpass error: ${err.message}`, true);
  }
}

async function jumpToPlace(query) {
  if (!query.trim()) return;
  setStatus(`Searching "${query}"…`);
  try {
    const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    const data = await res.json();
    if (!data?.[0]) {
      setStatus(`No match for "${query}"`, true);
      return;
    }
    const { lat, lon } = data[0];
    state.map.setView([parseFloat(lat), parseFloat(lon)], 14);
  } catch (err) {
    console.error(err);
    setStatus(`Search failed: ${err.message}`, true);
  }
}

// ---- init --------------------------------------------------------------

function init() {
  state.map = L.map(dom.map, {
    center: [37.7749, -122.4194], // San Francisco — known dense bookshop coverage
    zoom: 13,
    zoomControl: true,
    attributionControl: true,
  });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(state.map);

  state.layerGroup = L.layerGroup().addTo(state.map);

  state.map.on('moveend', scheduleFetch);
  state.map.on('zoomend', scheduleFetch);

  document.querySelectorAll('input[name="filter"]').forEach((input) => {
    input.addEventListener('change', (e) => applyFilter(e.target.value));
  });

  dom.searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    jumpToPlace(dom.searchInput.value);
  });

  scheduleFetch();
}

init();
