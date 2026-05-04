# Blockers

## HTTPS not enforced on openbookmap.org
- Symptom: typing `openbookmap.org` defaults to `http://`. `https://`
  works in Safari but Brave/Firefox have shown intermittent cert
  warnings (mismatched name on `www.openbookmap.org`).
- Root cause guess: GitHub Pages issued a cert covering the apex but
  not the `www` alternate, so `www.openbookmap.org` triggers warnings;
  Pages won't enable "Enforce HTTPS" until both names validate.
- Why we can't fix this in code: a JS http→https redirect would loop
  if the cert is still bad, making the site fully unreachable.
- Next steps to try (in order):
  1. GitHub → Settings → Pages: remove the custom domain entirely,
     wait 60 seconds, re-add it. Forces fresh DNS check + cert request.
  2. Confirm SSL Labs reports valid certs covering BOTH names:
     - https://www.ssllabs.com/ssltest/analyze.html?d=openbookmap.org
     - https://www.ssllabs.com/ssltest/analyze.html?d=www.openbookmap.org
  3. Once both are clean, tick "Enforce HTTPS" in Settings → Pages.
- If after 24 hours `Enforce HTTPS` is still greyed out, file a
  GitHub Support ticket with the SSL Labs results — likely a stuck
  Let's Encrypt issuance on their side.

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
