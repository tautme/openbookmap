import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/components.css';
import { installAnalytics } from '../lib/analytics.js';

installAnalytics();

// Map-first landing: ask for the user's location, redirect to /map.html
// centered there. Tahoe is the fallback if geolocation is denied or
// times out.
const FALLBACK = { lat: 38.9333, lon: -119.9833, z: 12, label: 'South Lake Tahoe' };
const ZOOM = 12;
const TIMEOUT_MS = 3000;

function go(coords, zoom) {
  const url = `./map.html?lat=${coords.lat.toFixed(4)}&lon=${coords.lon.toFixed(4)}&z=${zoom}`;
  location.replace(url);
}

function setStatus(msg) {
  const el = document.getElementById('status');
  if (el) el.textContent = msg;
}

async function getLocation() {
  if (!navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(null),
      { timeout: TIMEOUT_MS, maximumAge: 5 * 60 * 1000 },
    );
  });
}

(async () => {
  setStatus('Locating…');
  const here = await getLocation();
  if (here) {
    go(here, ZOOM);
  } else {
    setStatus(`No location — opening ${FALLBACK.label}`);
    go(FALLBACK, FALLBACK.z);
  }
})();
