# Contributing to OpenBookMap

Thanks for considering a contribution. This is a small, volunteer, open-source project. A thoughtful one-line fix is welcome. A sprawling architectural rewrite is not.

## Ways to help, in order of "how quickly you can start"

1. **Use the site and file issues.** Broken behavior, typos, confusing copy, performance problems.
2. **Photograph shelves in real used bookstores.** The point of the project. Go to `/contribute`.
3. **Correct existing data.** The `/me` page lets you edit and delete your own contributions. A wider flag/report UI is coming.
4. **Ship code.** See below.

---

## Before you write code

- Read the [README](./README.md) for the architecture and the philosophy.
- **Open an issue first** for anything larger than a bug fix or a small copy change. We'd rather talk about the plan than ask you to redo the code.
- This project is opinionated about simplicity. We keep vanilla JS. We keep plain CSS. We avoid state libraries. If a proposed change adds a dependency, make the case in the issue.

---

## Local setup

See the README's "Local development" section. Summary:

```bash
cp .env.example .env
npm install
npm run dev
```

---

## Code style

- **One concern per file.** If a module grows past ~300 lines, split it.
- **ES modules only.** No implicit globals.
- **JSDoc on every non-trivial function.** Purpose, inputs, outputs.
- **No hard-coded user-facing strings.** Add them to `src/lib/strings.js` — we plan to localize.
- **When you touch an OSM tag**, add a comment linking to its wiki page. Future maintainers will thank you.
- **Comments explain WHY, not WHAT.** Well-named identifiers describe what. A comment should only exist when a reader would be confused without it.
- **Handle errors.** If a fetch fails, show the user something useful via `showError` from `src/lib/errors.js`. Don't leave a silent `console.error` the user can't see.

Automated checks (run in CI, please run locally before pushing):

```bash
npm run format:check
npm run lint
npm test
```

`npm run format` fixes Prettier issues automatically.

---

## Writing SQL migrations

- Every schema change is a new file under `supabase/migrations/NNNN_short_description.sql`.
- **Never edit a committed migration.** If you need to undo something, write a new migration that reverses it.
- Additive, idempotent statements only: `create table if not exists`, `alter table ... add column if not exists`, `drop policy if exists ...` before `create policy`.
- RLS is on **every** table. Default: public select, authenticated insert (enforced to `auth.uid()`), owner-only update/delete. Deviations must be justified in a comment.

---

## Adding an OCR provider

See `src/ocr/README.md`. Tl;dr: expose a function that matches the `extractTitles(image, opts)` signature, and call `setOcrProvider(...)` at app startup.

---

## Pull request checklist

- [ ] Branch from `main`.
- [ ] Tests pass locally.
- [ ] Lint and format are clean.
- [ ] New user-facing strings are in `strings.js`.
- [ ] New dependencies are justified in the PR description.
- [ ] Related issue is linked.

PR titles: present-tense, imperative, ≤ 70 characters. (`add shop_overrides table`, not `added shop_overrides table`.)

---

## Community

Daily open Zoom at 10:00 AM PST: [us02web.zoom.us/j/4639378882](https://us02web.zoom.us/j/4639378882). Introduce yourself, pitch an idea, or just listen.

Email: [adam@openbookmap.org](mailto:adam@openbookmap.org).

We follow the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/) code of conduct. Be kind.
