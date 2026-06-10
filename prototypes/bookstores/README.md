# Bookstores — KISS POC

A standalone Leaflet map that shows **every `shop=books` on OpenStreetMap**
in the current viewport, with a filter switch to focus on
**All / Used / Indie / Chain**. Confirms that the main app's existing
Overpass query is already catching all bookstores; this prototype just
makes the category split visible.

Hosted-testable on `raw.githack.com` like the other prototypes — no
build step, no `npm install`. Standalone in `prototypes/bookstores/`.

## What it does

- Centers on San Francisco at zoom 13 by default (known dense coverage).
- Pan / zoom → debounced (700 ms) Overpass fetch for the new bbox.
- Each result is plotted as a coloured dot:
  - 🟧 **used** — `second_hand=yes` or `=only`
  - 🟩 **indie** — no `brand` / `brand:wikidata` tag
  - 🟪 **chain** — has `brand:wikidata`
  - ⬜ **unknown** — no name, no brand (rare; data quality issue)
- Click a dot for name, address, website, category badges, and an OSM
  link.
- Filter radio (top-right) toggles which category is visible. Counts in
  the bottom-left legend update on each fetch.
- "Jump to a city" search uses Nominatim.

## Categorization rules (single bin per shop)

Priority cascade so each shop falls into exactly one bin and the legend
adds up to the visible count:

1. If `second_hand` is `yes` or `only` → **used** (even if branded).
2. Else if `brand` or `brand:wikidata` is set → **chain**.
3. Else if the shop has a `name` → **indie**.
4. Else → **unknown**.

A used + branded store (e.g. Half Price Books) lands in **used** because
that's the salient attribute for a book-discovery user. The OSM link in
each popup shows the raw tags if you want to verify.

## Why client-side filtering

The Overpass fetch is the same `nwr["shop"="books"](bbox)` the main app
already uses. Filters apply after the fetch so:

- Flipping the radio is instant — no extra network round-trip.
- One bbox = one cached result while the map sits still.
- Indie/used/chain logic stays in `bookstores.js` where it's easy to
  iterate without changing query shape.

## Running it

Hosted (no install):

```
https://raw.githack.com/tautme/openbookmap/claude/bookstores-poc/prototypes/bookstores/index.html
```

Local:

```bash
python3 -m http.server 8000
# open http://localhost:8000/prototypes/bookstores/
```

## Wiring

- **Leaflet 1.9.4** from jsdelivr (no `npm install`).
- **OpenStreetMap tile server** for basemap. Has a [tile usage policy](https://operations.osmfoundation.org/policies/tiles/);
  for any real deployment, point at your own tile cache or a paid
  provider.
- **Overpass endpoint:** `https://overpass-api.de/api/interpreter`,
  matching `src/lib/overpass.js`. Per OSM's recommendation, swap to
  `lz4.overpass-api.de` if you hit CORS or slow responses.
- **Nominatim** for the search box.
- Min zoom 6 to avoid hammering Overpass with continent-sized bboxes
  (matches `MIN_OVERPASS_ZOOM` in the main app).

## What's not in v0

- No URL state — pan/search results aren't shareable as links.
- No marker clustering. Dense urban areas with 100+ dots will be busy.
- No saving / favoriting / "I've visited this one."
- No cross-session memory of what's been viewed.
- The four bins are mutually exclusive in this UI; a real filter would
  let you toggle "used" and "indie" together.

## Comparing to the main app

`src/lib/overpass.js` already executes the same `shop=books` query the
POC does — there's no missing coverage of indie bookstores. The main
app's distinction between "used / for-sale stock" lives elsewhere
(curated lists, contributor-uploaded spines), not in the Overpass
filter. If you want this POC's category dots in the live map, add
`categorize()` to the main app's marker rendering — it's a ~20-line
change.
