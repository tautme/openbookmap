import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/components.css';
import { installAnalytics } from '../lib/analytics.js';

installAnalytics();

// Map-first landing: redirect straight to the map centered on South Lake
// Tahoe. We tried browser geolocation here previously, but the prompt
// added friction (and a bad UX for users who deny it), so we now always
// land on Tahoe. Users can search any city from the map's searchbar.
const TAHOE = { lat: 38.9333, lon: -119.9833, z: 12 };

const url = `./map.html?lat=${TAHOE.lat.toFixed(4)}&lon=${TAHOE.lon.toFixed(4)}&z=${TAHOE.z}`;
location.replace(url);
