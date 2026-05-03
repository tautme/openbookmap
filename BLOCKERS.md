# Blockers

## Map page does not load on iOS Safari
- Symptom: openbookmap.org/map.html fails to render on iOS Safari (date noted by maintainer).
- Works on desktop Safari, Chrome, Brave (when HTTPS warning is bypassed).
- Likely candidates (in order): (a) HTTPS / cert warning blocking the page entirely on iOS;
  (b) ES2022 features unsupported on older iOS versions; (c) the Leaflet
  topbar/searchbar fixed positioning interacting with iOS viewport quirks.
- To diagnose: connect iPhone to Mac → Safari → Develop menu → device's name → /map.html
  → Console tab. Need the actual error.
- Not blocking other work but blocks any "go test on a phone in a real bookstore"
  validation, including the new prototype's mobile path.
