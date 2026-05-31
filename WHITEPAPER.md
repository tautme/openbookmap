# OpenBookMap

**A public, open-source map of used and independent bookstores —
with their shelves searchable from a phone photograph.**

White paper · v0.1 · 2026

---

## Abstract

Independent and used bookstores collectively hold inventories of
cultural and material value, yet that inventory is invisible to anyone
not standing in the shop. When a store closes, the curation goes with
it. OpenBookMap is a free, open-source project that lets anyone with
a phone contribute a shelf photo, runs OCR on the device to extract
titles, and publishes the result as part of a public, searchable map
of every independent bookstore in the world. The location layer comes
from [OpenStreetMap](https://www.openstreetmap.org/); the inventory
layer is contributor-built and openly licensed. The implementation is
deliberately small: a static site, no servers we operate ourselves,
every layer replaceable. The aim is durable, open civic infrastructure
for the offline book economy.

**Live:** [openbookmap.org](https://openbookmap.org) ·
**Source:** [github.com/tautme/openbookmap](https://github.com/tautme/openbookmap) ·
**License:** MIT (code), open data licensing (contributions; see §10).

---

## 1. The problem

A used or independent bookstore's value comes from two things: its
*selection* (which is the owner's accumulated taste) and its
*serendipity* (which is the customer encountering a book they didn't
know they wanted). Both are invisible from the internet.

- A reader looking for a specific used book has no efficient way to
  find it. Calling stores is the working solution in 2026.
- A bookstore looking to advertise its current stock has no
  affordable, neutral place to list it.
- A researcher or librarian interested in the geography of book
  retail has no open dataset describing what's actually on shelves
  in independent shops.
- When a store closes, decades of curation disappear without trace.

Existing platforms address pieces of this poorly:

| Platform | Why it falls short |
|---|---|
| AbeBooks | Amazon-owned; transactional; not a public dataset |
| Biblio.com | Commercial marketplace; not open data |
| Bookogs | Defunct (folded into Discogs and then shuttered) |
| Goodreads / Storygraph | Reader-facing; no bookstore inventory layer |
| OpenLibrary | Bibliographic database; not bookstore-facing |
| OpenStreetMap | Has bookstore *locations* (`shop=books`) but no inventory |

OpenBookMap fills the inventory gap, and does so with the same open
principles that make OpenStreetMap usable for everyone.

---

## 2. What we're building

A two-layer public catalog:

1. **The location layer** — every independent and used bookstore in
   the world. This is read directly from OpenStreetMap via the
   Overpass API. We do not duplicate the data into our database; we
   *reference* it by OSM id. Improvements to OSM benefit the project
   automatically.

2. **The inventory layer** — contributor-uploaded shelf photos with
   OCR-extracted, human-confirmed titles. This is the data we own
   and openly license. Each contribution is keyed to an OSM bookstore
   id so the two layers stay aligned.

The public-facing site lets anyone:

- Browse a map of every bookstore in OSM, with category dots for
  *used / indie / chain*.
- Click a shop to see its photos and indexed titles.
- Search across shop names and book titles globally.
- (With an account) contribute photos and titles.

---

## 3. How it works

A typical contribution path:

1. A volunteer walks into a bookstore (preferably with the owner's
   blessing — see §8) and takes phone photos of shelves.
2. They open `openbookmap.org/contribute`, sign in, and drop the
   photos onto the page.
3. The browser does everything else **locally**:
   - Compresses each photo to a display and thumbnail derivative.
   - Runs OCR on the original — currently PaddleOCR (more accurate)
     or Tesseract.js (lighter, falls back automatically). A device-
     capability auto-pick is in review.
   - Returns candidate titles for the contributor to confirm, edit,
     or discard.
4. Confirmed titles, photos, and metadata are uploaded to a
   Postgres database with Row-Level Security policies enforcing
   "you can only edit / delete your own contributions."
5. Within minutes, the shop's page on the public map reflects the
   new contribution.

The key architectural choice: **OCR runs on the contributor's
device, not on a server.** This keeps operating costs at near-zero,
sidesteps the privacy and licensing concerns of sending images to a
cloud OCR API, and aligns with the project's "every layer
replaceable" principle (any provider matching a small interface can
be swapped in).

---

## 4. Principles

The project makes design decisions against five tests, in order:

1. **KISS** — the simplest thing that works, even if "fancier" is
   available. A page is HTML until it has to be JS. A backend is one
   binary until it has to be many.
2. **Unix philosophy** — small pieces with simple data interfaces.
   OSM owns *places*; our DB owns *contributions*; an OSM id joins
   them.
3. **Independence per section** — every layer of the stack is
   replaceable on its own. OCR providers swap behind an interface.
   The map page doesn't import the database client. Hosting,
   analytics, OCR, and database are all candidate-swappable.
4. **Open source / open data first** — software we can read, fork,
   and self-host. Data we don't have to ask permission to use.
5. **Don't migrate until it hurts** — when a simpler tool appears,
   we document it as a migration target. We switch only when the
   current tool stops earning its keep.

These principles are operationalized in
[ROADMAP.md](./ROADMAP.md) and [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## 5. Architecture (one page)

| Layer | Choice | Why |
|---|---|---|
| **Hosting** | GitHub Pages (static) | Free. Cacheable. No servers we operate. |
| **Build** | [Vite](https://vitejs.dev/) multi-page | Each page is a real `.html` entry; no SPA shell. |
| **Framework** | Vanilla JS, ES modules | Seven pages, mostly read-only. A component runtime would not earn its keep. |
| **Map** | [Leaflet](https://leafletjs.com/) + OSM tiles | Mature, light, no API key. |
| **Bookstore data** | [OpenStreetMap](https://www.openstreetmap.org/) via Overpass API | Source-of-truth for places; community-maintained; free. |
| **Backend** | [Supabase](https://supabase.com/) (Postgres + Auth + Storage) | Open-source platform. Schema versioned as SQL migrations in the repo. |
| **OCR** | PaddleOCR (ONNX) + Tesseract.js, both client-side | No cloud OCR billing. Swappable interface. |
| **Spine detection** | YOLOv11n, in-browser | Fetched at runtime from Hugging Face; not committed to the repo. |
| **Analytics** | [GoatCounter](https://www.goatcounter.com/) | Cookieless, privacy-respecting, GDPR-clean by default. |
| **Tests / lint** | Vitest, ESLint, Prettier | Standard, runs in CI. |

Operating cost target: **$0 to start, ~$20/month ceiling** (Supabase
Pro tier only when free tier is outgrown). No paid infrastructure
required to operate, fork, or self-host the project today.

---

## 6. Current status (as of 2026-Q2)

The site is live and the core contribution loop works end-to-end:
sign in, pick a shop, upload photos, confirm titles, see the result
on the map.

Recent work has focused on:

- **Shipped** — a swappable OCR provider interface with a `?ocr=`
  URL flag for A/B testing engines (PR #17); profile-page resilience
  with per-section timeouts (PR #14); a standalone shelf-labeling
  tool (PR #13).
- **In review** — a YOLOv11n in-browser scan prototype with
  tap-to-capture and IndexedDB persistence (PR #19); a KISS live
  spine counter (PR #21); a public map of every `shop=books`
  filtered by used/indie/chain (PR #20); device-aware OCR auto-pick
  with a visible UI switch (PR #23).
- **Documented** — a forward roadmap in [ROADMAP.md](./ROADMAP.md);
  a no-JavaScript simplification plan; known operational blockers
  in [BLOCKERS.md](./BLOCKERS.md).

The project is intentionally still small. The right next milestone
is **a smooth, reliable contributor flow on a smartphone, end-to-end**,
not breadth of geographic coverage.

---

## 7. Roadmap

See [ROADMAP.md](./ROADMAP.md) for the live version. In summary:

- **Near term** — toolchain reproducibility, enabling cookieless
  analytics, finishing the open PR queue, resolving HTTPS / iOS
  Safari blockers, merging the device-aware OCR picker.
- **Mid term** — move OCR model weights off git (runtime fetch,
  same pattern proven by the scan prototype); port used/indie
  category dots into the live map; daily ops digest via a scheduled
  GitHub Action.
- **Long term** — if and only if it earns its keep: contributor
  re-capture workflows for inventory freshness, deeper bibliographic
  linking (Wikidata, Open Library), partnerships with adjacent
  archives.

---

## 8. Ethics: bookstores as partners

OpenBookMap photographs the inside of private businesses. That has
implications, and we name them rather than paper over them:

- **Contributors should ask.** A shelf photo with the owner's
  blessing is a contribution; a shelf photo taken without consent is
  not what this project is for. We treat this as a contributor
  norm, not a technical control.
- **Stores can opt out.** A bookstore that doesn't want a
  contribution on its OSM-id page can request removal via an issue
  or email; we will honor it.
- **No price scraping, no purchase routing.** We index *what's on
  shelves*, not *what's for sale at what price*. The goal is
  discoverability, not arbitrage.
- **Contributors retain their copyright** to the images they
  upload; they license the use of the image to the project under
  terms compatible with open-data norms. (Final licensing details
  are being settled — see §10.)

This is the load-bearing ethical stance of the project. We exist
because used bookstores are valuable; treating their owners as
partners (and not as subjects of extraction) is non-negotiable.

---

## 9. Why this is a good fit for open infrastructure

OpenBookMap is the kind of project that **does not exist** unless
it's built as a commons:

- A commercial competitor would silo the data and charge for it.
- A bookstore-owned consortium would never form (too fragmented,
  too small per shop).
- A national library or archive would build something heavier and
  more centralized.
- A platform play (think "Yelp for books") would extract rent and
  put bookstores in a bad bargaining position.

A small, KISS, open-source project — that bookstores can ignore,
verify, fork, or self-host — is the right shape for the problem.

---

## 10. Licensing & contribution

- **Code**: MIT (see [LICENSE](./LICENSE)).
- **Contributor data** (shelf photos, transcribed titles): the
  project is finalizing licensing terms compatible with OSM/Wikidata
  precedent (Open Database License + Creative Commons attribution
  for media). Contributors will be asked to confirm the license at
  upload. Current users see a license note on the upload page;
  watch [PRIVACY.md](./PRIVACY.md) and CONTRIBUTING.md for updates.
- **Bookstore location data** comes from OpenStreetMap under ODbL
  and is not re-licensed by us.

Contribution is open:

- File issues, fix typos, ship code: see
  [CONTRIBUTING.md](./CONTRIBUTING.md).
- Upload shelf photos: [openbookmap.org/contribute](https://openbookmap.org/contribute).
- Improve bookstore data: directly on [OpenStreetMap](https://www.openstreetmap.org/).
- Partner discussions: open a discussion on the GitHub repo.

---

## 11. Who we'd like to talk to

- **Independent bookstore owners and associations** — to test the
  contributor flow on real shelves and refine the ethics of how it
  shows up in their store.
- **Open-data and civic-tech projects** — particularly anyone working
  in adjacent commons (OSM contributors, Internet Archive volunteers,
  Open Library, Wikidata).
- **Researchers studying book culture and retail geography** — the
  dataset, however small today, is publicly queryable.
- **Funders and sponsors** willing to support open digital
  infrastructure at a small budget. Cost ceilings, principles, and
  honest limitations are documented openly; we're not asking for
  scale capital.

Reach the maintainer via the [GitHub repo](https://github.com/tautme/openbookmap).

---

## 12. Honest limitations

Worth naming up front so nobody is surprised:

- **OCR accuracy is the gating constraint.** Stylized spines,
  rotated text, and faded covers all degrade extraction.
  Contributors confirm titles before publish, which mostly hides this
  from the public dataset — but it slows the contribution flow.
- **Inventory freshness has no automation.** A shelf photographed
  today is correct today. We don't yet have re-capture workflows.
- **Coverage is wherever contributors are.** No central seeding.
  Cities with active contributors will look great; cities without
  will look empty.
- **The contributor base is small.** This is a v0 project, not a
  scaled platform.
- **Dependencies on third-party services** (Supabase, GitHub Pages,
  OSM Overpass) are real. We have migration targets documented for
  each (see ROADMAP §Migration candidates).

We surface these because the alternative — overclaiming and
under-delivering — is a worse failure mode for an open project than
shipping honestly.

---

*OpenBookMap — built KISS, open, and in public. Read the code; file
a bug; photograph a shelf. The point of the project is the shelves.*
