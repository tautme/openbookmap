/**
 * FAQ entries used on the landing page and the /about page.
 * Plain markup — keep short. Links are allowed.
 */
export const faq = [
  {
    q: 'Why build on OpenStreetMap?',
    a: 'OSM is the world’s best open geographic database, maintained by a global community. It already tags used bookstores. Building on top of it means we don’t reinvent the map — and our bookstore data enriches the commons for everyone.',
  },
  {
    q: 'Who owns the data?',
    a: 'Nobody. Everybody. Shop locations derived from OSM carry the ODbL license. Contributed photos are released under CC-BY-SA 4.0. Title metadata is released under ODbL-compatible terms so it can flow back into open databases.',
  },
  {
    q: 'How accurate is the shelf scanning?',
    a: 'Current accuracy is middling — Tesseract.js reads print titles fine on well-lit photos, less well on ornate spines. Every title is confirmed by a human before it is saved. We plan to add a vision-model fallback once the budget allows.',
  },
  {
    q: 'Is this only for English-language books?',
    a: 'No. The system is language-agnostic from day one. Tokyo, Buenos Aires, Reykjavík — if there’s a used bookstore with a shelf, it belongs on the map.',
  },
  {
    q: 'Are you a business?',
    a: 'No. This is a volunteer project. If it grows, it will stay non-commercial, open-source, and community-governed.',
  },
  {
    q: 'What do you track about me?',
    a: 'Privacy-respecting page counts via GoatCounter — no cookies, no fingerprinting, no ad networks. Details live on the <a href="/about.html#privacy">About page</a>.',
  },
];
