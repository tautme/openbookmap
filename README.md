# OpenBookMap

A global, open map of used bookstores — with searchable inventories built from shelf photos. Built on OpenStreetMap, in the spirit of OpenSkiMap.

**Live site:** [openbookmap.org](https://openbookmap.org)

---

## Stack

- **Build:** [Vite](https://vitejs.dev/) multi-page, static output to `dist/`.
- **Framework:** Vanilla JS with ES modules and small HTML templates. No React/Preact — seven pages don't need a component runtime.
- **Map:** Leaflet + `leaflet.markercluster`, CartoDB Positron tiles.
- **Data:** Supabase (PostgreSQL + Storage + Auth) — the only backend.
- **OCR:** Tesseract.js, lazy-loaded only on `/contribute`. A YOLOv8n spine detector (`models/spine-yolov8n.onnx`) crops each spine before OCR runs per crop.
- **Analytics:** [GoatCounter](https://www.goatcounter.com/) (cookieless, privacy-respecting).
- **Tests:** Vitest. **Lint/format:** ESLint + Prettier.
- **Hosting:** GitHub Pages (static), deployed via GitHub Actions.

**Cost:** $0 to start. Budget ceiling $20/mo — Supabase Pro ($25) only when we outgrow free tier.

---

## Pages

| Path | What it does |
|---|---|
| `/` | Editorial landing page with project summary, iterations, FAQ. |
| `/map` | Full-screen Leaflet map, Overpass-queried bookstores, sliding detail panel. URL state (`?lat=&lon=&z=&shop=type/id`) is shareable. |
| `/contribute` | Email + password auth, drag-and-drop photo upload with OCR and client-side thumbnailing. |
| `/shop?type=node&id=123` | Permanent shareable page for one bookstore. |
| `/search?q=...` | Fuzzy search across shop names and book titles. |
| `/me` (and `/me.html?name=adam`) | Profile + your contributions, with delete controls. |
| `/about` | Mission, principles, privacy. |
| `/404.html` | Not-found page. |

---

## Architecture — decisions and why

### Static-first, multi-page, no SPA
Each page is a real `.html` entry that Vite bundles independently. GitHub Pages serves the files directly. No client-side router, no 404 rewrites. Shop URLs use query params (`/shop?type=node&id=123`) instead of path params (`/shop/node/123`) because the latter would require either a SPA shell or server rewrites — neither is worth the complexity at this scale.

### Vanilla JS, not React/Preact
Seven pages, mostly read-only, one heavy map, two forms. A component framework would pay for itself with reduced cognitive load only if we had shared, highly-dynamic stateful UI — we don't. The map uses Leaflet directly; panels are string-template renderers; forms are tiny.

### Supabase as the only backend
Postgres + Auth + Storage in one place, with Row Level Security enforced at the database. No custom server code to run, deploy, or patch.

### Additive SQL migrations
`supabase/migrations/0001_initial.sql` is the original schema. Every subsequent change lands in a new numbered file (`0002_...`, `0003_...`). Nothing is ever rewritten.

### OCR behind an interface
`src/ocr/index.js` exports `extractTitles(image)`. The current Tesseract provider is one implementation; a vision-LLM fallback can be added later without touching the contribute flow. See `src/ocr/README.md`.

### Photo derivatives, client-side
Every upload produces a 1600px display JPEG and a 400px thumbnail, both via `browser-image-compression`. We upload both to Supabase Storage. The map's photo grid uses the thumbnail; the lightbox uses the display size.

---

## Local development

### Prerequisites
Node 20+.

### First run

```bash
git clone https://github.com/tautme/openbookmap.git
cd openbookmap
cp .env.example .env       # fill in the Supabase URL + anon key
npm install
npm run dev
```

Open http://localhost:5173. Each HTML file at the repo root (`/`, `/map.html`, `/contribute.html`, etc.) is its own entry point.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with HMR. |
| `npm run build` | Static build → `dist/`. |
| `npm run preview` | Serve `dist/` locally to verify the production build. |
| `npm run lint` | ESLint over `src/` and `tests/`. |
| `npm run format` | Prettier write. |
| `npm run format:check` | Prettier check only — runs in CI. |
| `npm test` | Vitest (unit tests for pure functions). |
| `npm run test:watch` | Vitest in watch mode. |

---

## Deployment

### Supabase

One-time:

1. Create a project at [supabase.com](https://supabase.com/).
2. Open **SQL Editor** → paste `supabase/migrations/0001_initial.sql` → run.
3. Repeat for `0002_profiles_flags_overrides.sql`.
4. **Authentication → URL Configuration** — set Site URL and Redirect URLs to your domain (`https://openbookmap.org`) plus `http://localhost:5173` for dev.
5. **Authentication → Providers → Email** — make sure Email is enabled; disable magic link if you want password-only.
6. Copy your Project URL and anon key into `.env` (local) and into GitHub repository secrets (CI).

Each future schema change: add a new `NNNN_<name>.sql` file under `supabase/migrations/` and paste it into the Supabase SQL editor. Versioned, reviewable, reversible-ish.

### GitHub Pages

The `.github/workflows/deploy.yml` workflow runs on every push to `main`:

1. Builds with Vite.
2. Copies `CNAME` into `dist/` (preserves the custom domain).
3. Uploads and deploys via `actions/deploy-pages`.

**Required repository secrets:**

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_GOATCOUNTER_CODE` (optional — analytics)

Configure in **Settings → Secrets and variables → Actions**.

DNS already points `openbookmap.org` at GitHub Pages (four A records + a `www` CNAME). GitHub's auto-TLS issues a Let's Encrypt certificate.

---

## Continuous integration

`.github/workflows/ci.yml` runs on every PR and every push to `main`:

- `npm run format:check`
- `npm run lint`
- `npm test`
- `npm run build` (with placeholder env — verifies the build graph)

Failing checks block merge.

---

## Database schema

See `supabase/migrations/0001_initial.sql` and `0002_profiles_flags_overrides.sql` for the source of truth. Summary:

- **profiles** — one row per user. Adds `username` (unique), `bio`, `avatar_url`.
- **shops** — one row per OSM shop we have contributions for. `(osm_type, osm_id)` uniqueness.
- **photos** — one row per uploaded photo. Stores `display_path` (1600px) and `thumb_path` (400px) in Supabase Storage.
- **books** — one row per confirmed book title. Adds `isbn`, `language` (ISO 639-1), `genre`.
- **contributions** — append-only audit log.
- **flags** — user-reported problems. **Reporter-only read** (plus future moderators), authenticated insert. Nobody can enumerate other users' reports.
- **shop_overrides** — project corrections to OSM data (closed shop, better photo). One row per shop, nullable columns, public read.

All tables have RLS enabled. The anon key is safe to ship — RLS is the security boundary.

---

## Re-training the spine detector

The upload flow crops each spine with a YOLOv8n detector before running OCR per crop. To regenerate `models/spine-yolov8n.onnx`:

1. Open `training/yolo_spine.ipynb` in Google Colab (runtime: T4 GPU is plenty).
2. Paste a Roboflow API key into the indicated cell. The default dataset is `capjamesg/book-spines`; if that slug/version has moved, swap in any other "book spine" dataset from [Roboflow Universe](https://universe.roboflow.com/) via the fallback cell.
3. Run all cells. The last cell downloads `spine-yolov8n.onnx`.
4. Commit it to `models/spine-yolov8n.onnx` in this repo — GitHub Pages will serve it directly. The browser fetches it from `./models/spine-yolov8n.onnx` relative to `contribute.html`.

If the ONNX file is missing or fails to load, the contribute flow falls back to the full-image OCR path, so nothing is broken while you iterate.

---

## Known limitations

- OCR accuracy is Tesseract-English, about 50–65% on well-lit spines. A vision-model fallback is planned.
- Search is case-insensitive `ILIKE`, not true fuzzy search with ranking. Good enough until we see real query volume.
- No localization — `src/lib/strings.js` is set up to make adding it easy when the international contributor community asks.
- No mobile app. Web-only.
- No moderator role yet — only the filer sees their flags.

---

## License

- **Code:** MIT (see `LICENSE`).
- **Shop locations:** derived from OpenStreetMap, ODbL.
- **User-contributed photos:** CC-BY-SA 4.0.
- **User-contributed title metadata:** ODbL-compatible terms so it can flow back into open data.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Daily Zoom at 10am PST: [us02web.zoom.us/j/4639378882](https://us02web.zoom.us/j/4639378882). Email [adam@openbookmap.org](mailto:adam@openbookmap.org).

---

## Privacy

See [PRIVACY.md](./PRIVACY.md).
