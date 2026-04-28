import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/components.css';
import '../styles/map.css';

import { mountTopbar } from '../components/topbar.js';
import { mountFooter } from '../components/footer.js';
import { supabase } from '../lib/supabase.js';
import { escapeHtml } from '../lib/format.js';
import { strings } from '../lib/strings.js';
import { installAnalytics } from '../lib/analytics.js';

installAnalytics();
mountTopbar({ active: 'search' });
mountFooter();

const PAGE_SIZE = 30;

const form = document.getElementById('search-form');
const input = document.getElementById('search-q');
const results = document.getElementById('results');

// Pre-populate from the URL so a search is bookmarkable.
const params = new URLSearchParams(location.search);
const initialQ = params.get('q') ?? '';
if (initialQ) {
  input.value = initialQ;
  runSearch(initialQ);
} else {
  results.innerHTML = `<div class="empty">${escapeHtml(strings.search.noQuery)}</div>`;
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const q = input.value.trim();
  const url = new URL(location.href);
  if (q) url.searchParams.set('q', q);
  else url.searchParams.delete('q');
  history.replaceState(null, '', url.toString());
  runSearch(q);
});

async function runSearch(q) {
  if (!q) {
    results.innerHTML = `<div class="empty">${escapeHtml(strings.search.noQuery)}</div>`;
    return;
  }
  results.innerHTML = `<div class="empty">Searching…</div>`;

  // Use pg_trgm via `ilike` — simple, effective for short queries.
  // Real fuzzy ranking can come later with a materialized view.
  const like = `%${q.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;

  const [{ data: shops }, { data: books }] = await Promise.all([
    supabase
      .from('shops')
      .select('id, osm_type, osm_id, name, city, country, photo_count, book_count')
      .ilike('name', like)
      .order('book_count', { ascending: false })
      .limit(PAGE_SIZE),
    supabase
      .from('books')
      .select('id, title, author, shop_id, shops!inner(osm_type, osm_id, name)')
      .or(`title.ilike.${like},author.ilike.${like}`)
      .limit(PAGE_SIZE),
  ]);

  const hasShops = shops?.length;
  const hasBooks = books?.length;
  if (!hasShops && !hasBooks) {
    results.innerHTML = `<div class="empty">${escapeHtml(strings.search.empty(q))}</div>`;
    return;
  }

  const shopsHtml = hasShops
    ? `<div class="card">
        <h3 style="font-family:var(--font-mono);font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:var(--ink-soft);margin-bottom:12px">${escapeHtml(strings.search.shopsHeading)}</h3>
        <ul class="book-list">${shops
          .map(
            (s) =>
              `<li>
                 <span class="title"><a href="/shop.html?type=${encodeURIComponent(s.osm_type)}&id=${encodeURIComponent(s.osm_id)}">${escapeHtml(s.name || strings.map.unnamed)}</a></span>
                 <span class="author">${escapeHtml([s.city, s.country].filter(Boolean).join(', '))}</span>
               </li>`,
          )
          .join('')}</ul>
      </div>`
    : '';

  const booksHtml = hasBooks
    ? `<div class="card">
        <h3 style="font-family:var(--font-mono);font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:var(--ink-soft);margin-bottom:12px">${escapeHtml(strings.search.booksHeading)}</h3>
        <ul class="book-list">${books
          .map(
            (b) =>
              `<li>
                 <span class="title">${escapeHtml(b.title)} ${b.author ? `<span style="color:var(--ink-soft);font-size:13px">· ${escapeHtml(b.author)}</span>` : ''}</span>
                 <span class="author">${
                   b.shops
                     ? `<a href="/shop.html?type=${encodeURIComponent(b.shops.osm_type)}&id=${encodeURIComponent(b.shops.osm_id)}">${escapeHtml(b.shops.name || 'shop')}</a>`
                     : ''
                 }</span>
               </li>`,
          )
          .join('')}</ul>
      </div>`
    : '';

  results.innerHTML = shopsHtml + booksHtml;
}
