import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/components.css';
import '../styles/map.css';

import { mountTopbar } from '../components/topbar.js';
import { mountFooter } from '../components/footer.js';
import { supabase, publicUrl } from '../lib/supabase.js';
import { fetchShopById } from '../lib/overpass.js';
import { formatOsmAddress, pickName, pickWebsite, getLatLon } from '../lib/osm-tags.js';
import { escapeHtml, escapeAttr, timeAgo } from '../lib/format.js';
import { strings } from '../lib/strings.js';
import { installAnalytics } from '../lib/analytics.js';

installAnalytics();
mountTopbar({ active: 'map' });
mountFooter();

const params = new URLSearchParams(location.search);
const type = params.get('type');
const id = params.get('id');

const root = document.getElementById('shop-root');

if (!type || !id) {
  root.innerHTML = `<div class="card"><h2>${escapeHtml(strings.shop.notFound)}</h2></div>`;
} else {
  renderShop(type, id);
}

async function renderShop(osmType, osmId) {
  root.innerHTML = `<div class="card"><p>${escapeHtml(strings.shop.loading)}</p></div>`;

  // Overpass (OSM) + Supabase in parallel.
  const [osmEl, { data: shopRows }] = await Promise.all([
    fetchShopById(osmType, osmId).catch(() => null),
    supabase
      .from('shops')
      .select('id, photo_count, book_count, updated_at')
      .eq('osm_type', osmType)
      .eq('osm_id', osmId)
      .limit(1),
  ]);

  if (!osmEl && !shopRows?.length) {
    root.innerHTML = `<div class="card"><h2>${escapeHtml(strings.shop.notFound)}</h2></div>`;
    return;
  }

  const name = osmEl ? pickName(osmEl.tags, strings.map.unnamed) : 'Unknown shop';
  const addr = osmEl ? formatOsmAddress(osmEl.tags || {}) : '';
  const website = osmEl ? pickWebsite(osmEl.tags || {}) : '';
  const coords = osmEl ? getLatLon(osmEl) : null;
  const shop = shopRows?.[0];

  let photosHtml = `<div class="empty">${escapeHtml(strings.map.noPhotos)}</div>`;
  let booksHtml = `<div class="empty">${escapeHtml(strings.map.noBooks)}</div>`;
  let contribsHtml = '';

  if (shop) {
    const [{ data: photos }, { data: books }, { data: contribs }] = await Promise.all([
      supabase
        .from('photos')
        .select('id, storage_path, thumb_path, shelf_label, caption, created_at')
        .eq('shop_id', shop.id)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('books')
        .select('title, author, created_at')
        .eq('shop_id', shop.id)
        .order('title')
        .limit(500),
      supabase
        .from('contributions')
        .select('action, created_at, user_id')
        .eq('target_type', 'photo')
        .in(
          'target_id',
          (await supabase.from('photos').select('id').eq('shop_id', shop.id).limit(50)).data?.map(
            (p) => p.id,
          ) ?? [],
        )
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    if (photos?.length) {
      photosHtml =
        '<div class="photo-grid" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr))">' +
        photos
          .map((p) => {
            const thumb = publicUrl(p.thumb_path || p.storage_path);
            const full = publicUrl(p.storage_path);
            return `<a href="${escapeAttr(full)}" target="_blank" rel="noopener"><img loading="lazy" src="${escapeAttr(thumb)}" alt="${escapeAttr(p.shelf_label || '')}" title="${escapeAttr(p.caption || '')}" /></a>`;
          })
          .join('') +
        '</div>';
    }

    if (books?.length) {
      booksHtml =
        '<ul class="book-list">' +
        books
          .map(
            (b) =>
              `<li><span class="title">${escapeHtml(b.title)}</span><span class="author">${escapeHtml(b.author || '')}</span></li>`,
          )
          .join('') +
        '</ul>';
    }

    if (contribs?.length) {
      contribsHtml = `<ul class="book-list">${contribs
        .map(
          (c) =>
            `<li><span class="title">${escapeHtml(c.action)}</span><span class="author">${escapeHtml(timeAgo(c.created_at))}</span></li>`,
        )
        .join('')}</ul>`;
    }
  }

  const osmUrl = `https://www.openstreetmap.org/${osmType}/${osmId}`;

  root.innerHTML = `
    <div class="card">
      <div style="font-family:var(--font-mono);font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:var(--ink-soft)">
        Bookstore · OSM ${escapeHtml(osmType)}/${escapeHtml(osmId)}
      </div>
      <h2 style="margin-top:6px;font-size:32px;font-weight:600;letter-spacing:-0.01em">${escapeHtml(name)}</h2>
      <p style="color:var(--ink-soft);margin:8px 0 0">${escapeHtml(addr || strings.map.unknownAddress)}</p>
      <p style="margin-top:10px">
        ${website ? `<a href="${escapeAttr(website)}" target="_blank" rel="noopener">Website</a> · ` : ''}
        <a href="${escapeAttr(osmUrl)}" target="_blank" rel="noopener">${escapeHtml(strings.shop.openInOsm)}</a>
        ${coords ? ` · <a href="/map.html?lat=${coords.lat}&lon=${coords.lon}&z=16&shop=${osmType}/${osmId}">See on map →</a>` : ''}
      </p>
      <div class="stats" style="margin-top:18px">
        <div><strong>${shop?.photo_count ?? 0}</strong>photos</div>
        <div><strong>${shop?.book_count ?? 0}</strong>books indexed</div>
      </div>
      <p>
        <a class="btn stamp" href="/contribute.html?osm_type=${encodeURIComponent(osmType)}&osm_id=${encodeURIComponent(osmId)}&name=${encodeURIComponent(name)}${coords ? `&lat=${coords.lat}&lon=${coords.lon}` : ''}">
          ${escapeHtml(strings.map.contributeCta)}
        </a>
      </p>
    </div>

    <div class="card">
      <h3 style="font-family:var(--font-mono);font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:var(--ink-soft);margin-bottom:12px">${escapeHtml(strings.shop.photos)}</h3>
      ${photosHtml}
    </div>

    <div class="card">
      <h3 style="font-family:var(--font-mono);font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:var(--ink-soft);margin-bottom:12px">${escapeHtml(strings.shop.books)}</h3>
      ${booksHtml}
    </div>

    ${
      contribsHtml
        ? `<div class="card">
            <h3 style="font-family:var(--font-mono);font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:var(--ink-soft);margin-bottom:12px">${escapeHtml(strings.shop.contributions)}</h3>
            ${contribsHtml}
          </div>`
        : ''
    }
  `;
}
