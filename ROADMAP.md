# OpenBookMap Roadmap

A living document covering **where the project stands, what to ship
next, and how we keep simplifying as we grow**. Updated when the
landscape changes — not a contract.

If you only read one section: jump to [Priorities — test &
integrate next](#priorities--test--integrate-next).

---

## Guiding principles

We make decisions against five tests, in order:

1. **KISS** — the simplest thing that works, even if "fancier" is
   available. A page is HTML until it has to be JS. A backend is one
   binary until it has to be many. We don't add frameworks, services,
   or abstractions to pre-solve problems we don't have.
2. **Unix philosophy** — each piece does one thing well, with a simple
   data interface to the next piece. OSM is the source of truth for
   *places*; our database is the source of truth for *user
   contributions*; the join key is the OSM id. Resist mixing them.
3. **Independence per section** — every part of the stack should be
   replaceable on its own. OCR is already behind a swappable
   `extractTitles()` interface. The map page doesn't import Supabase.
   We push toward more of this with every iteration.
4. **Open source / open data first** — prefer software we can read,
   fork, and self-host if needed. Prefer data we don't have to ask
   permission to use (OSM, Hugging Face open weights).
5. **Don't migrate until it hurts** — when something simpler comes
   along, document it as a migration target. Switch only when the
   current tool stops earning its keep.

---

## Where things stand

The site is live at [openbookmap.org](https://openbookmap.org). The
core stack is set, the basic contribute → map → search loop works,
and recent work has focused on **prototype-driven exploration** of
new features rather than rewriting old ones.

**What's already done that matches our principles** (so we don't
"propose" them as if they're new):
- ✅ Static-first, Vite multi-page, no SPA — README §Architecture.
- ✅ Supabase schema as SQL migrations under `supabase/migrations/`
  (additive, numbered, reviewable).
- ✅ OCR behind a swappable interface (`src/ocr/index.js`) — paddle,
  tesseract, anything else can be a drop-in.
- ✅ `?ocr=` URL flag for live A/B comparison of OCR engines.
- ✅ A `prototypes/` lab for KISS single-purpose experiments.
- ✅ Cookieless analytics chosen (GoatCounter) — code wired, just
  not turned on yet (see [Ops & visibility](#ops--visibility)).

---

## Work shipped & in flight (this iteration)

### Merged to `main`

| Area | Summary |
|---|---|
| OCR flag (PR #17) | `?ocr=paddle\|tesseract\|default` — pin one engine for testing without code changes. |
| `/me` resilience (PR #14) | Profile sections load independently with per-section timeouts. |
| `/me` hardening (PR #11) | Bulletproof rendering + reverted PaddleOCR to single-rotation. |
| Spine-vision labeler (PR #13) | Standalone hand-labeling tool in `spine-vision/labeler/`. |
| Branch hygiene | 9 merged feature branches deleted locally; remote-side delete pending. |

### Open PRs awaiting review / merge

| PR | What it is | Status |
|---|---|---|
| **#18** | Subtitle copy edit | Yours; merge or close. |
| **#19** | **Scan prototype** — YOLOv11n in-browser, camera + tap-to-capture + IndexedDB + orientation + geo. WebGPU-first, WASM fallback, FPS counter, model fetched from Hugging Face at runtime. Confirmed working on raw.githack across 3 URLs. | Ready to merge after on-device sanity. |
| **#20** | **Bookstores POC** — Leaflet map of every `shop=books` on OSM, filterable by used / indie / chain. Confirms the main app already pulls all bookstores; the gap was visibility, not coverage. | Ready to merge after browser test. |
| **#21** | **Spine-count POC (KISS)** — counter only, no save / no metadata. The "counting kernel" stripped from #19. | Untested in browser; verify before merge. |

### Known issues (carried)

- **Local dev blocked** for the maintainer — npm 6.14.4 / macOS Monterey. Vite needs Node 18+. See [Priorities](#priorities--test--integrate-next).
- **GitHub Pages "build failed" emails** — strong hypothesis: Pages "Source" is on legacy Jekyll mode rather than "GitHub Actions." Needs a one-click confirmation in repo settings.
- **HTTPS on custom domain** — see `BLOCKERS.md`. Currently worked around by a manual link page at `openbookmap.org`.
- **iOS Safari map** — see `BLOCKERS.md`. Blocks on-phone testing of any new prototype.

---

## Priorities — test & integrate next

In order. Each item names files and approximate effort. **Do the
unblockers first** — they multiply everything that follows.

### Unblockers (this week)

1. **Pin the toolchain.** Add `.nvmrc` (`20`) and `"engines": { "node": ">=20" }` to `package.json`. CI already uses Node 20; this makes the dev box match. ~5 minutes.
2. **Upgrade Node on the dev Mac.** `nvm install 20 && nvm use 20`. With (1) in place, this becomes "open repo, install, run" forever. Unblocks all future PR verification.
3. **Check Pages source.** `Settings → Pages → Source`. If it's "Deploy from a branch," flip to "GitHub Actions." Should stop the failure emails.

### Turn on visibility (this week)

4. **Enable GoatCounter.** Sign up at goatcounter.com (free for personal/small sites — or self-host if you want), get your "code" (subdomain), add it as `VITE_GOATCOUNTER_CODE` in GitHub repo secrets. The code path (`src/lib/analytics.js`) already loads it when the env var is set. Next deploy = live stats at `<your-code>.goatcounter.com`. ~10 minutes once you have an account.

### Ship the queue (this/next week)

5. **Test PR #19 (scan)** on a real phone with a real shelf; merge if behavior is acceptable.
6. **Test PR #20 (bookstores)** in any browser; merge once category dots match reality on a few cities.
7. **Test PR #21 (spine-count)** in a browser; merge if the live count tracks.
8. **Decide PR #18** — merge the subtitle edit or close.

### Housekeeping

9. **Clean up remote branches.** Several merged branches are still on origin (sandbox couldn't delete them). One `git push origin --delete …` batch from your Mac clears it.
10. **Reconcile `prototypes/spine-scanner/` (on main) vs `prototypes/scan/` (PR #19) vs `prototypes/spine-count/` (PR #21).** Decide which lives, which dies, document which is which in a one-line `prototypes/README.md` index.

---

## Ops & visibility

### "How many visitors?"

After GoatCounter is enabled (priority #4 above):

- Dashboard: `<your-code>.goatcounter.com` — public or password-protected, your choice.
- Shows: pageviews, referrers, top pages, browsers, countries. No cookies, no IP logging, GDPR-clean by default.
- Self-hosting option if you ever want it: GoatCounter is a single Go binary, runs on any small VPS. The hosted free tier is generous and saves the ops work.

### "Who signed up?"

Today, no admin page is needed — the Supabase dashboard has the answer:

- **Supabase Dashboard → Authentication → Users** — count, emails, signup time, last sign-in.
- **Supabase Dashboard → SQL Editor** — for one-liners like:
  ```sql
  -- users in the last 7 days
  select count(*) from auth.users where created_at > now() - interval '7 days';
  -- top contributors by photo count
  select user_id, count(*) as photos
    from public.photos group by user_id order by photos desc limit 10;
  ```

If you later want a one-glance view, the KISS path is **a scheduled
GitHub Action that runs a SQL query and posts the result to a Discord
or email webhook** once a day. No admin page to maintain, no auth
surface to secure, no client-side code to write.

A bigger admin page (e.g. `admin.html`) is doable later but every
piece of admin UI is more code to keep alive. We don't add it until
the daily-summary path stops being enough.

---

## Roadmap — near / mid / far

### Near (this quarter)

- Finish the unblocker list above.
- Merge or close all four open PRs.
- Resolve `BLOCKERS.md` items (HTTPS cert, iOS Safari map).
- Pick one of PR #19 / #21 as the canonical spine flow; retire the other.
- Document the GoatCounter dashboard URL in the README.
- Consider the "lean & fast" simplification plan
  (`/root/.claude/plans/what-would-it-look-melodic-lemur.md` —
  copy into the repo if useful): make `about.html`, `404.html`,
  landing truly static; audit/remove the ~24 MB unused OCR wasm
  variant; verify the ~10 MB shared JS chunk isn't leaking heavy
  libs into every page.

### Mid (next quarter)

- **Cross-prototype convergence.** The scan, spine-count, and
  spine-vision-labeler all share image-handling code that's worth
  factoring into one small utility under `src/lib/` once we know
  which flow wins.
- **Map page: visualize indie / chain on the live map.** PR #20
  proved the categorization works. Port the ~20-line `categorize()`
  function into `src/pages/map.js` so the live site shows the same
  dots.
- **Move OCR models off git.** `public/ocr-models/` carries ~51 MB
  in the repo; only `/contribute` uses it, and the scan prototype
  already proved runtime-fetch from Hugging Face works (PR #19).
  Apply the same pattern to Paddle/Tesseract: ship code, not
  weights.
- **Daily ops digest.** Scheduled GitHub Action → Supabase query →
  webhook. ~50 lines.

### Far (someday / maybe)

- **Inventory sync from a real bookstore POS.** Hard, but the
  long-term moat.
- **Federation / mirrors.** If the project grows, multiple regional
  mirrors that share OSM ids but cache differently.
- **Mobile app.** Only if the web Capture flow proves the demand.
  PWA install of `/contribute` may be sufficient first.

---

## Migration candidates (when something hurts)

We're not migrating anything today. This is a list of *known
options* so we don't have to rediscover them when the time comes.

### Database / backend layer

| Option | Why it's interesting | Why we'd stay | When we'd switch |
|---|---|---|---|
| **Stay on Supabase** (current) | Postgres + Auth + Storage in one place, schema-as-SQL-migrations works, free tier covers us, the platform itself is open source. | Already wired, already understood. | — |
| **PocketBase** | One Go binary, embedded SQLite, auth + storage + realtime, deploys to any $5 VPS. The KISS-est OSS backend in this category. | Smaller ecosystem than Postgres; SQLite write-throughput ceiling. | If we ever want a single binary we fully understand, and traffic stays modest. |
| **Plain Postgres + PostgREST + GoTrue** | Same parts Supabase wraps; we assemble. | Higher ops burden than PocketBase, lower than full Supabase self-host. | If we outgrow Supabase free tier but want to stay on Postgres. |
| **Self-host Supabase** | Same surface area as today. | Significant ops (multi-container, backups, certs). Anti-KISS unless we have an ops person. | Only if a hard dependency requires it. |

### Hosting

- **GitHub Pages (current)** — right answer until we need server-side execution. Free, simple.
- **Cloudflare Pages / Netlify** — branch previews are the main draw; would solve the "test a branch without merging" friction. Worth doing the day we ship more than once a month.
- **Small VPS (Hetzner, Fly)** — only when we adopt a backend that needs a server. Pair with PocketBase if/when that happens.

### Analytics

- **GoatCounter (chosen)** — cookieless, simple, self-hostable. No alternative needed.

### OCR

- Already a swappable interface — no migration needed; just add new providers behind `extractTitles()`.

---

## What we're explicitly NOT doing

To keep the future scope honest:

- **No React / Vue / Svelte / SPA framework.** Seven static pages
  don't need one. README §Architecture is the long version.
- **No custom Node API server.** Supabase's PostgREST + RLS *is*
  our API.
- **No GraphQL layer.** Same reason.
- **No serverless functions** unless they replace work the client
  currently does badly — not on speculation.
- **No mobile-native rewrite** before a PWA install of the existing
  contribute flow has been tried.
- **No premature Astro / SSG migration.** It's documented as an
  option (see the "what would no JS look like?" assessment) but
  buys mostly maintainability, not a faster map. Tier-1 pruning of
  the content pages is the higher-ROI win.

---

## Conventions for this document

- Update this file when something material changes. Small
  PR-by-PR updates are welcome.
- The roadmap "Far" section is dreams, not promises. Don't optimize
  for it.
- If a section in the README contradicts this file, the README
  is canonical for the stack; this file is canonical for the plan.
