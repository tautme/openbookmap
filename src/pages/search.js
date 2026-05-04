import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/components.css';
import '../styles/map.css';

import { mountTopbar } from '../components/topbar.js';
import { mountFooter } from '../components/footer.js';
import { supabase, publicUrl } from '../lib/supabase.js';
import { escapeHtml, escapeAttr } from '../lib/format.js';
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
      .select(
        'id, title, author, photo_id, shop_id, shops!inner(osm_type, osm_id, name, photo_count, book_count)',
      )
      .or(`title.ilike.${like},author.ilike.${like}`)
      .limit(PAGE_SIZE),
  ]);

  const hasShops = shops?.length;
  const hasBooks = books?.length;
  if (!hasShops && !hasBooks) {
    results.innerHTML = `<div class="empty">${escapeHtml(strings.search.empty(q))}</div>`;
    return;
  }

  // Pull the photo records for any book hits so we can show the image
  // when the user expands a result.
  const photoIds = (books ?? []).map((b) => b.photo_id).filter(Boolean);
  const photoById = new Map();
  if (photoIds.length) {
    const { data: photos } = await supabase
      .from('photos')
      .select('id, storage_path, thumb_path')
      .in('id', photoIds);
    for (const p of photos ?? []) photoById.set(p.id, p);
  }

  results.innerHTML =
    (hasShops ? renderShops(shops) : '') + (hasBooks ? renderBooks(books, photoById) : '');
  wireExpanders();
}

function renderShops(shops) {
  return `<div class="card">
    <h3 class="card-heading">${escapeHtml(strings.search.shopsHeading)}</h3>
    <ul class="book-list">${shops
      .map(
        (s) =>
          `<li>
             <span class="title"><a href="/shop.html?type=${encodeURIComponent(s.osm_type)}&id=${encodeURIComponent(s.osm_id)}">${escapeHtml(s.name || strings.map.unnamed)}</a></span>
             <span class="author">${escapeHtml([s.city, s.country].filter(Boolean).join(', '))}</span>
           </li>`,
      )
      .join('')}</ul>
  </div>`;
}

function renderBooks(books, photoById) {
  return `<div class="card">
    <h3 class="card-heading">${escapeHtml(strings.search.booksHeading)}</h3>
    <ul class="book-list book-results">${books
      .map((b, i) => renderBookRow(b, i, photoById))
      .join('')}</ul>
  </div>`;
}

function renderBookRow(b, i, photoById) {
  const photo = b.photo_id ? photoById.get(b.photo_id) : null;
  const shop = b.shops || {};
  const shopHref =
    shop.osm_type && shop.osm_id
      ? `/shop.html?type=${encodeURIComponent(shop.osm_type)}&id=${encodeURIComponent(shop.osm_id)}`
      : null;
  const fullPhotoUrl = photo ? publicUrl(photo.storage_path) : null;

  // Each row is a <li> with two parts: the summary button (always shown)
  // and an <details>-style expansion below (hidden until expanded).
  return `<li class="book-result" data-i="${i}">
    <button type="button" class="book-summary">
      <span class="title">${escapeHtml(b.title)} ${b.author ? `<span class="author-inline">· ${escapeHtml(b.author)}</span>` : ''}</span>
      <span class="author">${shop.name ? escapeHtml(shop.name) : ''}</span>
    </button>
    <div class="book-expanded" hidden>
      ${fullPhotoUrl ? `<a class="book-photo" href="${escapeAttr(fullPhotoUrl)}" target="_blank" rel="noopener"><img loading="lazy" src="${escapeAttr(fullPhotoUrl)}" alt="${escapeAttr(b.title)}" /></a>` : '<div class="empty">No photo on record.</div>'}
      <div class="book-meta">
        ${shopHref ? `<a class="btn stamp" href="${escapeAttr(shopHref)}">View ${escapeHtml(shop.name || 'shop')} →</a>` : ''}
        <div class="book-stats">
          <span><strong>${shop.book_count ?? 0}</strong> books indexed</span>
          <span><strong>${shop.photo_count ?? 0}</strong> photos</span>
        </div>
      </div>
    </div>
  </li>`;
}

function wireExpanders() {
  results.querySelectorAll('.book-result').forEach((row) => {
    const btn = row.querySelector('.book-summary');
    const expanded = row.querySelector('.book-expanded');
    if (!btn || !expanded) return;
    btn.addEventListener('click', () => {
      const open = !expanded.hidden;
      // Collapse all other rows first — only one open at a time keeps the
      // page tidy when the user scans many hits.
      results.querySelectorAll('.book-expanded').forEach((el) => {
        el.hidden = true;
      });
      results.querySelectorAll('.book-summary').forEach((el) => el.classList.remove('open'));
      if (!open) {
        expanded.hidden = false;
        btn.classList.add('open');
      }
    });
  });
}
