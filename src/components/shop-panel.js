import { escapeHtml, escapeAttr } from '../lib/format.js';
import { publicUrl, supabase } from '../lib/supabase.js';
import { strings } from '../lib/strings.js';
import { formatOsmAddress, pickName, pickWebsite, getLatLon } from '../lib/osm-tags.js';

/**
 * Render the right-side shop panel body for a given OSM element.
 * Fills in Supabase data (photos, books, counts) asynchronously.
 *
 * @param {HTMLElement} inner   — panel's inner container
 * @param {object} osmElement   — Overpass element (node|way|relation with tags)
 */
export async function renderShopPanel(inner, osmElement) {
  const name = pickName(osmElement.tags, strings.map.unnamed);
  const addr = formatOsmAddress(osmElement.tags || {});
  const website = pickWebsite(osmElement.tags || {});
  const coords = getLatLon(osmElement);

  inner.innerHTML = `
    <div class="eyebrow">Bookstore · OSM ${escapeHtml(osmElement.type)}/${escapeHtml(String(osmElement.id))}</div>
    <h2><a href="/shop.html?type=${encodeURIComponent(osmElement.type)}&id=${encodeURIComponent(osmElement.id)}" style="color:inherit;text-decoration:none">${escapeHtml(name)}</a></h2>
    <div class="addr">${escapeHtml(addr || strings.map.unknownAddress)}${
      website
        ? ` · <a href="${escapeAttr(website)}" target="_blank" rel="noopener">website</a>`
        : ''
    }</div>
    <div class="stats">
      <div><strong id="stat-photos">—</strong>photos</div>
      <div><strong id="stat-books">—</strong>books indexed</div>
    </div>
    <h3>${strings.shop.photos}</h3>
    <div id="photos-area"><div class="empty">Loading…</div></div>
    <h3>${strings.shop.books}</h3>
    <div id="books-area"><div class="empty">Loading…</div></div>
    <div class="cta-bar">
      <a class="btn stamp" href="/contribute.html?osm_type=${encodeURIComponent(osmElement.type)}&osm_id=${encodeURIComponent(osmElement.id)}&name=${encodeURIComponent(name)}${coords ? `&lat=${coords.lat}&lon=${coords.lon}` : ''}">
        ${strings.map.contributeCta}
      </a>
    </div>
  `;

  const statPhotos = inner.querySelector('#stat-photos');
  const statBooks = inner.querySelector('#stat-books');
  const photosArea = inner.querySelector('#photos-area');
  const booksArea = inner.querySelector('#books-area');

  const { data: shops, error: shopErr } = await supabase
    .from('shops')
    .select('id, photo_count, book_count')
    .eq('osm_type', osmElement.type)
    .eq('osm_id', osmElement.id)
    .limit(1);

  if (shopErr) {
    statPhotos.textContent = '0';
    statBooks.textContent = '0';
    photosArea.innerHTML = `<div class="empty">${escapeHtml(strings.errors.generic)}</div>`;
    booksArea.innerHTML = `<div class="empty">${escapeHtml(strings.errors.generic)}</div>`;
    return;
  }

  if (!shops?.length) {
    statPhotos.textContent = '0';
    statBooks.textContent = '0';
    photosArea.innerHTML = `<div class="empty">${escapeHtml(strings.map.noPhotos)}</div>`;
    booksArea.innerHTML = `<div class="empty">${escapeHtml(strings.map.noBooks)}</div>`;
    return;
  }

  const shop = shops[0];
  statPhotos.textContent = shop.photo_count ?? 0;
  statBooks.textContent = shop.book_count ?? 0;

  const [{ data: photos }, { data: books }] = await Promise.all([
    supabase
      .from('photos')
      .select('id, storage_path, thumb_path, caption, shelf_label')
      .eq('shop_id', shop.id)
      .order('created_at', { ascending: false })
      .limit(6),
    supabase.from('books').select('title, author').eq('shop_id', shop.id).order('title').limit(100),
  ]);

  photosArea.innerHTML = renderPhotos(photos);
  booksArea.innerHTML = renderBooks(books);
}

function renderPhotos(photos) {
  if (!photos?.length) return `<div class="empty">${escapeHtml(strings.map.noPhotos)}</div>`;
  return (
    '<div class="photo-grid">' +
    photos
      .map((p) => {
        const thumb = publicUrl(p.thumb_path || p.storage_path);
        const full = publicUrl(p.storage_path);
        const alt = p.shelf_label || p.caption || '';
        return `<img loading="lazy" src="${escapeAttr(thumb)}" alt="${escapeAttr(alt)}" title="${escapeAttr(alt)}" onclick="window.open('${escapeAttr(full)}', '_blank')" />`;
      })
      .join('') +
    '</div>'
  );
}

function renderBooks(books) {
  if (!books?.length) return `<div class="empty">${escapeHtml(strings.map.noBooks)}</div>`;
  return (
    '<ul class="book-list">' +
    books
      .map(
        (b) =>
          `<li><span class="title">${escapeHtml(b.title)}</span><span class="author">${escapeHtml(b.author || '')}</span></li>`,
      )
      .join('') +
    '</ul>'
  );
}
