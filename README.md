# OpenBookMap

A global, open map of used bookstores — with searchable inventories built from shelf photos. Built on OpenStreetMap in the spirit of OpenSkiMap.

**Stack:** Static HTML/CSS/JS (no build step) · Leaflet for maps · Overpass API for OSM data · Supabase for photos/books/auth · Tesseract.js for in-browser OCR · GitHub Pages for hosting.

**Cost:** $0 to start. Supabase Pro ($25/mo) only if you grow past the free tier.

---

## Files

```
index.html     → Brochure / about page
map.html       → The global map of used bookstores
upload.html    → Contribute flow (sign in → upload → OCR → save)
schema.sql     → Database schema — paste into Supabase SQL editor
README.md      → This file
```

---

## Deployment — one-time setup

### 1. Set up Supabase (5 minutes)

Your project is at `https://jmikulhgpgfaarqzwrgl.supabase.co`. Now create the database tables.

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and open your project.
2. Left sidebar → **SQL Editor** → **New query**.
3. Open `schema.sql` from this repo. Copy the entire contents. Paste into the SQL editor.
4. Click **Run**. You should see "Success. No rows returned."
5. Verify: left sidebar → **Table Editor** — you should see 5 tables (`profiles`, `shops`, `photos`, `books`, `contributions`).
6. Verify storage: left sidebar → **Storage** — you should see a bucket called `shelf-photos`.

### 2. Configure Supabase auth (2 minutes)

1. Left sidebar → **Authentication** → **URL Configuration**.
2. Set **Site URL** to `https://openbookmap.org` (or your GitHub Pages URL, e.g. `https://<username>.github.io/openbookmap`).
3. Under **Redirect URLs**, add the same URL, plus `http://localhost:8000` for local testing.
4. Left sidebar → **Authentication** → **Providers** — confirm **Email** is enabled (it's on by default). The default settings send a "magic link" — this is what we want.

### 3. Deploy to GitHub Pages (10 minutes)

1. Create a new GitHub repo named `openbookmap` (public).
2. Upload these 5 files to the root: `index.html`, `map.html`, `upload.html`, `schema.sql`, `README.md`.
3. In the repo: **Settings → Pages**. Under "Source", choose **Deploy from a branch**, branch `main`, folder `/ (root)`. Save.
4. Wait ~1 minute. Your site is live at `https://<username>.github.io/openbookmap/`.

### 4. Point openbookmap.org at it (10 minutes, registrar-dependent)

1. In your domain registrar (wherever you bought `openbookmap.org`), add these DNS records:
   ```
   A     @    185.199.108.153
   A     @    185.199.109.153
   A     @    185.199.110.153
   A     @    185.199.111.153
   CNAME www  <your-github-username>.github.io
   ```
2. In your GitHub repo: **Settings → Pages → Custom domain** → enter `openbookmap.org` → save. Check **Enforce HTTPS** once it's available (may take 15–60 minutes for GitHub to issue the cert).
3. Update Supabase's Site URL and Redirect URLs (step 2 above) to `https://openbookmap.org` once the domain is live.

---

## Local testing

You cannot just double-click `index.html` — Supabase auth needs a real HTTP context. Run a tiny local server:

```bash
# Python 3
python3 -m http.server 8000

# or Node
npx serve .
```

Open [http://localhost:8000](http://localhost:8000).

---

## How the app works

1. **Visitor lands on `index.html`.** Learns about the project. Joins the mailing list (currently a `mailto:` — swap for a real provider later). Clicks "Open the Map →".
2. **`map.html` loads.** OSM tiles render. User pans or searches a city. When zoomed in enough, we query the Overpass API for `shop=books` + `second_hand=yes|only` nodes in the viewport and drop pins.
3. **Click a pin.** Side panel opens. We look up that OSM ID in our Supabase `shops` table — if anyone has contributed photos or books, they appear here.
4. **"Contribute photos →"** passes the OSM ID to `upload.html`.
5. **`upload.html`.** User signs in via email magic link. Uploads photos. Tesseract.js runs OCR in the browser (no server cost, ~5–15 sec per photo). User edits/confirms the title list. Hits save. Photos go to Supabase Storage, titles go to the `books` table.

---

## Security

- **The anon key in the HTML is safe to publish.** That's what it's designed for. Supabase's Row Level Security (RLS) policies — created by `schema.sql` — control what the anon key can actually do.
- **Current RLS policies:** anyone can read shops/photos/books. Only authenticated users can insert. Users can only update/delete their own contributions.
- **NEVER commit or share the `service_role` key.** That bypasses RLS. If you ever paste it by mistake, rotate immediately: Supabase dashboard → Project Settings → API → "Reset service role key".

---

## Known limits & next steps

**Working now:**
- Map with OSM used bookstores worldwide
- Shop panel with photos + book list
- Email sign-in, upload, OCR, confirm, save
- CC-BY-SA attribution on photos and books
- RLS-protected data

**Not yet built (good first contributions):**
- Global text search: "find all shops with a copy of *Gravity's Rainbow*"
- User profile page: "see everything I've contributed"
- OCR quality: current extraction is naive; a smarter pipeline (vision-LLM fallback when OCR confidence is low) would roughly double accuracy
- OSM account linking (OAuth)
- Moderation tools: flag / vote-down bad entries
- Mobile camera capture (swap to `capture="environment"` on phones)
- A real mailing-list provider (Buttondown, Listmonk, Mailchimp)

---

## Contributing

Work in progress. The daily call is the fastest way in:

- **Zoom:** [us02web.zoom.us/j/4639378882](https://us02web.zoom.us/j/4639378882)
- **Daily at 10:00 AM PST**
- **Email:** [adam@openbookmap.org](mailto:adam@openbookmap.org)

## License

- **Code:** MIT.
- **Shop locations:** derived from OpenStreetMap, ODbL.
- **User-contributed photos and book titles:** CC-BY-SA 4.0.
