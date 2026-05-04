# Standalone landing page

A single-file static landing for OpenBookMap. Designed to live anywhere
that can serve a directory of static files (Netlify drop, Cloudflare
Pages, an S3 bucket, the root of a domain, etc.). It is independent of
the main Vite app at `tautme.github.io/openbookmap/` and only links to
it.

## Files

```
index.html   The page itself (HTML + CSS, no JS)
shelf.jpg    Bookshelf hero image (you supply this — see below)
```

## Drop in the photo

Save the bookshelf photo as `shelf.jpg` in this directory. The HTML
references it with the relative path `shelf.jpg`. Recommended:

- JPEG, ~1920 px wide, quality ~80, under 400 KB.
- Anything bigger and mobile users wait too long on first paint.
- No EXIF rotation; bake the orientation into the pixels (most photo
  apps offer "Save copy" which does this).

## Run locally

```bash
cd landing
python3 -m http.server 8000
# visit http://localhost:8000
```

## Deploy

Drag the whole `landing/` folder into Netlify's deploy box, or upload
it to any static host. No build step, no environment variables.

## Update the link target

If the main app moves off `tautme.github.io/openbookmap/`, edit the
`href` inside `index.html` at `class="cta"`.
