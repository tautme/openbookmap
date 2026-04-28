import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/components.css';
import '../styles/map.css';

import { mountTopbar } from '../components/topbar.js';
import { mountFooter } from '../components/footer.js';
import { supabase, publicUrl } from '../lib/supabase.js';
import { escapeHtml, escapeAttr, timeAgo } from '../lib/format.js';
import { strings } from '../lib/strings.js';
import { showError, showSuccess, clearStatus } from '../lib/errors.js';
import { installAnalytics } from '../lib/analytics.js';

installAnalytics();
mountTopbar({ active: 'me' });
mountFooter();

const root = document.getElementById('me-root');

// /me shows the signed-in user. /me.html?name=adam shows another user's public profile.
const params = new URLSearchParams(location.search);
const viewingUsername = params.get('name');

supabase.auth.onAuthStateChange(() => render());
render();

async function render() {
  const { data: auth } = await supabase.auth.getUser();
  const me = auth?.user ?? null;

  if (viewingUsername) {
    renderOther(viewingUsername);
    return;
  }
  if (!me) {
    root.innerHTML = `
      <div class="card">
        <h2>${escapeHtml(strings.me.signedOut)}</h2>
        <p>
          <a class="btn stamp" href="/contribute.html">Sign in</a>
        </p>
      </div>`;
    return;
  }
  renderSelf(me);
}

async function renderSelf(user) {
  // Profile row should exist (auth trigger creates it). Load it for edit.
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, display_name, bio, avatar_url')
    .eq('id', user.id)
    .single();

  const [{ data: photos }, { data: books }] = await Promise.all([
    supabase
      .from('photos')
      .select('id, storage_path, thumb_path, shelf_label, created_at, shop_id')
      .eq('uploader_id', user.id)
      .order('created_at', { ascending: false })
      .limit(60),
    supabase
      .from('books')
      .select('id, title, author, created_at, shop_id')
      .eq('contributor_id', user.id)
      .order('created_at', { ascending: false })
      .limit(60),
  ]);

  const total = (photos?.length ?? 0) + (books?.length ?? 0);

  root.innerHTML = `
    <div class="card">
      <div style="font-family:var(--font-mono);font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:var(--ink-soft)">
        ${escapeHtml(user.email)}
      </div>
      <h2 style="font-size:28px;font-weight:600;letter-spacing:-0.01em;margin-top:6px">
        ${escapeHtml(profile?.display_name || profile?.username || 'Your contributions')}
      </h2>
      <form id="profile-form" style="margin-top:16px">
        <label style="display:block;font-family:var(--font-mono);font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:var(--ink-soft);margin-bottom:6px">
          ${escapeHtml(strings.me.usernameLabel)}
        </label>
        <input id="username" class="input" type="text" pattern="[a-z0-9\\-]{3,24}" value="${escapeAttr(profile?.username || '')}" placeholder="your-handle" />
        <label style="display:block;font-family:var(--font-mono);font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:var(--ink-soft);margin-top:14px;margin-bottom:6px">
          ${escapeHtml(strings.me.bioLabel)}
        </label>
        <textarea id="bio" class="input" rows="3" style="font-family:var(--font-serif);font-size:15px">${escapeHtml(profile?.bio || '')}</textarea>
        <div id="profile-status" hidden></div>
        <div style="margin-top:12px;display:flex;gap:10px;align-items:center">
          <button type="submit" class="btn stamp">${escapeHtml(strings.me.save)}</button>
          <a href="#" id="signout" style="font-family:var(--font-mono);font-size:12px;letter-spacing:0.1em">${escapeHtml(strings.contribute.signOut)}</a>
        </div>
      </form>
    </div>

    <div class="card">
      <h3 style="font-family:var(--font-mono);font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:var(--ink-soft);margin-bottom:12px">
        ${escapeHtml(strings.me.photosHeading)} · ${photos?.length ?? 0}
      </h3>
      ${renderMyPhotos(photos)}
    </div>

    <div class="card">
      <h3 style="font-family:var(--font-mono);font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:var(--ink-soft);margin-bottom:12px">
        ${escapeHtml(strings.me.booksHeading)} · ${books?.length ?? 0}
      </h3>
      ${renderMyBooks(books)}
    </div>

    ${total === 0 ? `<div class="empty">${escapeHtml(strings.me.noContributions)}</div>` : ''}
  `;

  wireProfileForm();
  wireDeleteButtons(photos, books);
  const signout = document.getElementById('signout');
  signout?.addEventListener('click', async (e) => {
    e.preventDefault();
    await supabase.auth.signOut();
  });
}

function renderMyPhotos(photos) {
  if (!photos?.length) return `<div class="empty">No photos yet.</div>`;
  return (
    '<div class="photo-grid" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr))">' +
    photos
      .map((p) => {
        const thumb = publicUrl(p.thumb_path || p.storage_path);
        return `
          <div style="position:relative">
            <img loading="lazy" src="${escapeAttr(thumb)}" alt="${escapeAttr(p.shelf_label || '')}" />
            <button class="btn secondary" data-delete-photo="${escapeAttr(p.id)}" style="position:absolute;top:6px;right:6px;padding:2px 6px;font-size:10px;background:var(--paper)">delete</button>
          </div>`;
      })
      .join('') +
    '</div>'
  );
}

function renderMyBooks(books) {
  if (!books?.length) return `<div class="empty">No titles yet.</div>`;
  return (
    '<ul class="book-list">' +
    books
      .map(
        (b) =>
          `<li>
             <span class="title">${escapeHtml(b.title)}</span>
             <span class="author">
               ${escapeHtml(b.author || '')} · ${escapeHtml(timeAgo(b.created_at))}
               <button class="btn secondary" data-delete-book="${escapeAttr(b.id)}" style="margin-left:8px;padding:2px 6px;font-size:10px">delete</button>
             </span>
           </li>`,
      )
      .join('') +
    '</ul>'
  );
}

function wireProfileForm() {
  const form = document.getElementById('profile-form');
  const statusEl = document.getElementById('profile-status');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearStatus(statusEl);
    const username = document.getElementById('username').value.trim().toLowerCase();
    const bio = document.getElementById('bio').value.trim();

    const { data: auth } = await supabase.auth.getUser();
    const me = auth?.user;
    if (!me) {
      showError(statusEl, strings.errors.notSignedIn);
      return;
    }
    const { error } = await supabase
      .from('profiles')
      .update({ username: username || null, bio: bio || null })
      .eq('id', me.id);
    if (error) {
      if (error.code === '23505') {
        showError(statusEl, strings.me.usernameTaken, error);
      } else {
        showError(statusEl, strings.me.saveFailed, error);
      }
      return;
    }
    showSuccess(statusEl, strings.me.savedSuccess);
  });
}

function wireDeleteButtons(photos, _books) {
  document.querySelectorAll('[data-delete-photo]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm(strings.me.deleteConfirm)) return;
      const id = btn.getAttribute('data-delete-photo');
      const photo = photos?.find((p) => p.id === id);
      // Best-effort storage cleanup. The RLS policy on `photos` enforces ownership.
      if (photo?.storage_path) {
        await supabase.storage.from('shelf-photos').remove([photo.storage_path]);
      }
      const { error } = await supabase.from('photos').delete().eq('id', id);
      if (error) {
        alert(strings.me.deleteFailed);
        return;
      }
      render();
    });
  });
  document.querySelectorAll('[data-delete-book]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm(strings.me.deleteConfirm)) return;
      const id = btn.getAttribute('data-delete-book');
      const { error } = await supabase.from('books').delete().eq('id', id);
      if (error) {
        alert(strings.me.deleteFailed);
        return;
      }
      render();
    });
  });
}

async function renderOther(username) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, display_name, bio')
    .eq('username', username)
    .single();

  if (!profile) {
    root.innerHTML = `<div class="card"><h2>User not found</h2></div>`;
    return;
  }

  const [{ data: photos }, { data: books }] = await Promise.all([
    supabase
      .from('photos')
      .select('id, storage_path, thumb_path')
      .eq('uploader_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(40),
    supabase
      .from('books')
      .select('id, title, author')
      .eq('contributor_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(40),
  ]);

  root.innerHTML = `
    <div class="card">
      <h2 style="font-size:28px;font-weight:600;letter-spacing:-0.01em">${escapeHtml(profile.display_name || profile.username)}</h2>
      <div style="font-family:var(--font-mono);font-size:11px;color:var(--ink-soft);margin-top:6px">@${escapeHtml(profile.username)}</div>
      ${profile.bio ? `<p style="margin-top:12px">${escapeHtml(profile.bio)}</p>` : ''}
    </div>
    <div class="card">
      <h3 style="font-family:var(--font-mono);font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:var(--ink-soft);margin-bottom:12px">Photos</h3>
      ${renderMyPhotos(photos).replace(/<button[^>]*>delete<\/button>/g, '')}
    </div>
    <div class="card">
      <h3 style="font-family:var(--font-mono);font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:var(--ink-soft);margin-bottom:12px">Books</h3>
      ${books?.length ? '<ul class="book-list">' + books.map((b) => `<li><span class="title">${escapeHtml(b.title)}</span><span class="author">${escapeHtml(b.author || '')}</span></li>`).join('') + '</ul>' : `<div class="empty">No titles yet.</div>`}
    </div>
  `;
}
