# AGENTS.md

Guidance for AI coding agents (Claude Code, Codex, etc.) working on
OpenBookMap. Read this before doing anything else.

## What this project is

OpenBookMap is a global, open-source map of used bookstores with shelf-
photo-derived inventories. Live at https://openbookmap.org. MIT licensed.
Built in the OpenStreetMap tradition: free to use, free to contribute,
forever.

**The defining product constraint:** every book on the map must come from
a shelf photo. No typed inventories, no scraped catalogs.

## Who you're working for

The maintainer is solo and a novice programmer. Default to short, plain-
language explanations. For any task that touches GitHub UI or Supabase
UI, give concrete click-paths. Don't assume professional dev workflows.

## Stack (do not change without asking)

- **Hosting:** GitHub Pages, custom domain via Fastmail DNS, deploy on
 push to `main` via GitHub Actions.
- **Build:** Vite 5, multi-page (no SPA router). Each HTML at repo root
 is a real Vite entry.
- **Frontend:** Vanilla JS + ES modules. Plain CSS with custom
 properties. HTML-string templating. Fraunces serif + DM Mono.
- **Map:** Leaflet 1.9 + leaflet.markercluster, CartoDB Positron tiles.
- **Data:** OSM shop locations via Overpass API (zoom ≥ 6). Referenced
 by `osm_type/osm_id`, never copied.
- **Backend:** Supabase only (Postgres + Auth + Storage). Email/password
 auth. RLS on every table.
- **OCR:** PaddleOCR via `@gutenye/ocr-browser` + `onnxruntime-web`,
 Tesseract.js fallback. Behind `extractTitles(image)` in `src/ocr/`.
- **Image processing:** `browser-image-compression` (400px thumb,
 1600px display).
- **Analytics:** GoatCounter, opt-in via env var.
- **Testing:** Vitest, pure-function unit tests.
- **Lint/format:** ESLint 9 + Prettier, both in CI.

## Hard rules — never violate

1. **No new dependencies** without explicit maintainer approval. Write
  the proposal to QUESTIONS.md instead.
2. **No framework, state library, router, or build complexity beyond
  Vite.** Vanilla stays vanilla.
3. **Migrations are additive only.** Never edit a committed file in
  `supabase/migrations/`. Write a new numbered migration.
4. **All user-facing strings live in `src/lib/strings.js`.** Don't
  inline copy anywhere else. Don't change string values during
  refactors.
5. **Every OSM tag used in code gets a comment linking to its wiki
  page.** Example: `// https://wiki.openstreetmap.org/wiki/Tag:shop%3Dbooks`
6. **Don't touch the legacy upload flow** (`upload.html`,
  `src/pages/upload.js`, `models/`, `training/`) unless the task is
  explicitly about retiring or merging it.
7. **Don't rebuild what works.** Extend.
8. **Don't merge to main.** Push to a branch. Don't open PRs unless
  asked. The maintainer reviews and merges.

## Conventions the maintainer values

- **KISS.** One concern per file. No 500-line files. If you can't
 decide between two approaches in 5 minutes, pick the one with less
 code.
- **Unix philosophy.** Small functions that do one thing. Compose them.
 Plain data, plain functions, no magic.
- **One pager rules the project.** If a feature doesn't fit on the
 landing page's pitch, it's out of scope — flag it, don't build it.
- **Push back briefly** if a request conflicts with KISS or the one-
 pager. Don't lecture; one or two sentences is enough.

## Repo layout (key paths)

