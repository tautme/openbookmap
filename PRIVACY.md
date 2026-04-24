# Privacy Policy

**Last updated:** 2026-04-24.

OpenBookMap is a small volunteer project. We don't sell data, run ads, or do behavioral tracking. This page documents everything we store and why.

## What we collect

### Aggregate analytics
We use [GoatCounter](https://www.goatcounter.com/) — a cookieless, privacy-respecting counter — to see how many people visit each page. It does **not** store your IP address, does **not** set cookies, and does **not** fingerprint your browser. Visitors with Do-Not-Track enabled are never counted.

### Account data
If you sign in to contribute:

- **Email address** — used as your login identifier.
- **Hashed password** — stored by Supabase Auth; we never see your plaintext password.
- **Profile row** — optional `username`, `bio`, and `avatar_url`. These are public if set.

### Contributed content
- **Photos** you upload, with a link to your user ID for attribution. Released under CC-BY-SA 4.0.
- **Book titles, authors, ISBNs** you add, with a link to your user ID. Released under ODbL-compatible terms.
- **Raw OCR text** of each photo, kept for debugging title extraction.
- **Contribution log** — one row per action (upload, add book, etc.) for community trust and abuse handling.

## What we don't collect

- No cookies (beyond the Supabase session token required for login).
- No ad networks, no social-media pixels, no cross-site tracking.
- No fingerprinting.
- No location history.
- No uploads of any kind unless you explicitly upload them.

## Where your data lives

- **Application code and static pages** are served from GitHub Pages. GitHub may log standard request information; see their [privacy notice](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).
- **Database, auth, and photo storage** are hosted by [Supabase](https://supabase.com/privacy). Our Supabase project is on the free tier in the `us-east` region.
- **Map tiles** come from [CartoDB](https://carto.com/attributions) and [OpenStreetMap](https://www.openstreetmap.org/copyright) — each tile request is a standard HTTP request to those services.
- **Place search** uses [Nominatim](https://operations.osmfoundation.org/policies/nominatim/) — each search query hits their servers subject to their usage policy.
- **Analytics** are aggregated at [GoatCounter](https://www.goatcounter.com/).

## Your rights

- **See your data:** `/me` shows everything tied to your account.
- **Delete your data:** delete individual photos and books from `/me`. To delete your whole account, email [adam@openbookmap.org](mailto:adam@openbookmap.org) and we'll remove it within a reasonable window.
- **Contribute anonymously:** don't sign in. You can browse the map, read shops, and search without an account.

## Changes

If we change what we track, we'll update this file and note the date at the top. Significant changes (new trackers, a new analytics vendor) will be announced on the landing page first.

## Contact

[adam@openbookmap.org](mailto:adam@openbookmap.org).
