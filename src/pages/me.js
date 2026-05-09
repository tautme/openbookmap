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

const root = document.getElementById('me-root');

// Per-section query timeout. A misconfigured Supabase or a stalled network
// would otherwise leave the page hung on "Loading…" forever. Sections that
// time out render their own error state; the rest keep going.
const SECTION_TIMEOUT_MS = 10000;

function fatalError(err) {
  console.error('me page failed', err);
  if (!root) return;
  root.innerHTML = `
    <div class="card">
      <h2>${escapeHtml(strings.errors?.generic ?? 'Something went wrong.')}</h2>
      <p style="color:var(--ink-soft);font-size:13px;margin-top:8px">
        ${escapeHtml(err?.message || String(err))}
      </p>
      <p style="margin-top:14px">
        <a class="btn" href="./map.html">Back to map</a>
      </p>
    </div>`;
}

try {
  installAnalytics();
} catch (e) {
  console.error('analytics init failed', e);
}
try {
  mountTopbar({ active: 'me' });
} catch (e) {
  console.error('topbar mount failed', e);
}
try {
  mountFooter();
} catch (e) {
  console.error('footer mount failed', e);
}

// /me shows the signed-in user. /me.html?name=adam shows another user's public profile.
const params = new URLSearchParams(location.search);
const viewingUsername = params.get('name');

supabase.auth.onAuthStateChange(() => start().catch(fatalError));
start().catch(fatalError);

async function start() {
  if (viewingUsername) {
    root.innerHTML = `<div class="empty">Loading profile @${escapeHtml(viewingUsername)}…</div>`;
    return renderOther(viewingUsername);
  }

  // Resolve the auth user with its own timeout so we never hang here.
  let me = null;
  try {
    const { data, error } = await withTimeout(
      supabase.auth.getUser(),
      SECTION_TIMEOUT_MS,
      'auth.getUser',
    );
    if (error && !/auth session missing|JWT|not authenticated/i.test(error.message || '')) {
      throw error;
    }
    me = data?.user ?? null;
  } catch (err) {
    fatalError(err);
    return;
  }

  if (!me) {
    root.innerHTML = `
      <div class="card">
        <h2>${escapeHtml(strings.me.signedOut)}</h2>
        <p>
          <a class="btn stamp" href="./contribute.html">Sign in</a>
        </p>
      </div>`;
    return;
  }

  renderSelf(me);
}

/**
 * Run a promise but reject after `ms` if it doesn't settle. This is a
 * timeout — the underlying query may still complete, but we stop
 * waiting on it.
 */
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Paint the page in sections. Each section shows the user's data
 * independently — a slow or failing query in one place does not
 * block the others.
 */
function renderSelf(user) {
  // Frame: paint everything we already know synchronously, with
  // placeholders for the rest. The user immediately sees their
  // email and account info, even if Supabase's other endpoints stall.
  root.innerHTML = `
    <div class="card" id="account-card">${accountHtml(user)}</div>
    <div class="card" id="profile-card">
      <h3 class="card-heading">Profile</h3>
      <div class="empty" id="profile-status">Loading profile…</div>
    </div>
    <div class="card" id="photos-card">
      <h3 class="card-heading" id="photos-heading">Photos</h3>
      <div class="empty" id="photos-status">Loading photos…</div>
    </div>
    <div class="card" id="books-card">
      <h3 class="card-heading" id="books-heading">Books</h3>
      <div class="empty" id="books-status">Loading books…</div>
    </div>
  `;

  // Each section loads on its own. Failures are caught locally and
  // surfaced inside the section, never bubbling up to take the whole
  // page down.
  loadProfile(user).catch((e) => sectionError('profile', e));
  loadPhotos(user).catch((e) => sectionError('photos', e));
  loadBooks(user).catch((e) => sectionError('books', e));
}

function sectionError(name, err) {
  console.error(`me · ${name} failed`, err);
  const el = document.getElementById(`${name}-status`);
  if (el) {
    el.classList.remove('empty');
    el.classList.add('status', 'error');
    el.textContent = `Could not load ${name}: ${err?.message || err}`;
  }
}

// ——— Account section (synchronous, never fails) ————————————————————
function accountHtml(user) {
  // Show every reliable field on the auth user object. We do not
  // attempt to touch the database here — this is the part that
  // works even if every other Supabase endpoint is broken.
  const created = user.created_at ? new Date(user.created_at).toLocaleString() : '—';
  const lastSignIn = user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : '—';
  const meta = user.user_metadata || {};
  const app = user.app_metadata || {};
  const identities = (user.identities || []).map((i) => i.provider).filter(Boolean);

  return `
    <div class="card-eyebrow">Signed in</div>
    <h2 style="font-size:28px;font-weight:600;letter-spacing:-0.01em;margin-top:6px">
      ${escapeHtml(user.email || '(no email on record)')}
    </h2>
    <dl style="margin-top:14px;display:grid;grid-template-columns:140px 1fr;gap:8px 14px;font-size:14px;line-height:1.5">
      <dt style="color:var(--ink-soft)">User ID</dt>
      <dd style="font-family:var(--font-mono);font-size:12px;word-break:break-all">${escapeHtml(user.id)}</dd>

      <dt style="color:var(--ink-soft)">Email confirmed</dt>
      <dd>${user.email_confirmed_at ? 'yes · ' + escapeHtml(new Date(user.email_confirmed_at).toLocaleDateString()) : 'no'}</dd>

      <dt style="color:var(--ink-soft)">Created</dt>
      <dd>${escapeHtml(created)}</dd>

      <dt style="color:var(--ink-soft)">Last sign-in</dt>
      <dd>${escapeHtml(lastSignIn)}</dd>

      ${
        identities.length
          ? `<dt style="color:var(--ink-soft)">Sign-in methods</dt>
             <dd>${identities.map((p) => escapeHtml(p)).join(', ')}</dd>`
          : ''
      }

      ${
        Object.keys(meta).length
          ? `<dt style="color:var(--ink-soft)">User metadata</dt>
             <dd><pre style="font-family:var(--font-mono);font-size:12px;background:var(--paper-deep);padding:8px;border-radius:4px;overflow-x:auto;margin:0">${escapeHtml(JSON.stringify(meta, null, 2))}</pre></dd>`
          : ''
      }

      ${
        Object.keys(app).length
          ? `<dt style="color:var(--ink-soft)">App metadata</dt>
             <dd><pre style="font-family:var(--font-mono);font-size:12px;background:var(--paper-deep);padding:8px;border-radius:4px;overflow-x:auto;margin:0">${escapeHtml(JSON.stringify(app, null, 2))}</pre></dd>`
          : ''
      }
    </dl>
    <div style="margin-top:14px">
      <a href="#" id="signout" class="btn secondary">${escapeHtml(strings.contribute.signOut)}</a>
    </div>
  `;
}

// Wire signout after the account card paints. Done lazily because
// the inline render() above doesn't have a reliable hook.
document.addEventListener(
  'click',
  (e) => {
    if (e.target?.id !== 'signout') return;
    e.preventDefault();
    supabase.auth.signOut();
  },
  true,
);

// ——— Profile section ———————————————————————————————————————————
async function loadProfile(user) {
  const card = document.getElementById('profile-card');
  if (!card) return;

  let profile = null;
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('profiles')
        .select('id, username, display_name, bio, avatar_url')
        .eq('id', user.id)
        .maybeSingle(),
      SECTION_TIMEOUT_MS,
      'profiles query',
    );
    if (error) throw error;
    profile = data;
  } catch (err) {
    sectionError('profile', err);
    return;
  }

  // Profile may legitimately not exist yet (the auth trigger creates one,
  // but not every install has the trigger wired). Render the editor
  // unconditionally — it can save a new row.
  card.innerHTML = `
    <h3 class="card-heading">Profile</h3>
    <form id="profile-form">
      <label style="display:block;font-family:var(--font-mono);font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:var(--ink-soft);margin-bottom:6px">
        ${escapeHtml(strings.me.usernameLabel)}
      </label>
      <input id="username" class="input" type="text" pattern="[a-z0-9\\-]{3,24}" value="${escapeAttr(profile?.username || '')}" placeholder="your-handle" />

      <label style="display:block;font-family:var(--font-mono);font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:var(--ink-soft);margin-top:14px;margin-bottom:6px">
        Display name
      </label>
      <input id="display_name" class="input" type="text" value="${escapeAttr(profile?.display_name || '')}" placeholder="What should we show on your contributions?" />

      <label style="display:block;font-family:var(--font-mono);font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:var(--ink-soft);margin-top:14px;margin-bottom:6px">
        ${escapeHtml(strings.me.bioLabel)}
      </label>
      <textarea id="bio" class="input" rows="3" style="font-family:var(--font-serif);font-size:15px">${escapeHtml(profile?.bio || '')}</textarea>

      <div id="profile-status" hidden></div>
      <div style="margin-top:12px">
        <button type="submit" class="btn stamp">${escapeHtml(strings.me.save)}</button>
      </div>
    </form>
  `;
  wireProfileForm(user);
}

function wireProfileForm(user) {
  const form = document.getElementById('profile-form');
  const statusEl = document.getElementById('profile-status');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearStatus(statusEl);
    const username = document.getElementById('username').value.trim().toLowerCase();
    const display_name = document.getElementById('display_name').value.trim();
    const bio = document.getElementById('bio').value.trim();

    const payload = {
      id: user.id,
      username: username || null,
      display_name: display_name || null,
      bio: bio || null,
    };
    // Upsert handles both first-time creation and updates.
    const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'id' });
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

// ——— Photos section ————————————————————————————————————————————
async function loadPhotos(user) {
  const card = document.getElementById('photos-card');
  if (!card) return;
  let photos = [];
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('photos')
        .select('id, storage_path, thumb_path, shelf_label, created_at, shop_id')
        .eq('uploader_id', user.id)
        .order('created_at', { ascending: false })
        .limit(60),
      SECTION_TIMEOUT_MS,
      'photos query',
    );
    if (error) throw error;
    photos = data || [];
  } catch (err) {
    sectionError('photos', err);
    return;
  }

  card.innerHTML = `
    <h3 class="card-heading">Photos · ${photos.length}</h3>
    ${renderMyPhotos(photos)}
  `;
  wireDeletePhotos(photos);
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

function wireDeletePhotos(photos) {
  document.querySelectorAll('[data-delete-photo]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm(strings.me.deleteConfirm)) return;
      const id = btn.getAttribute('data-delete-photo');
      const photo = photos.find((p) => p.id === id);
      if (photo?.storage_path) {
        await supabase.storage
          .from('shelf-photos')
          .remove([photo.storage_path])
          .catch(() => {});
      }
      const { error } = await supabase.from('photos').delete().eq('id', id);
      if (error) {
        alert(strings.me.deleteFailed);
        return;
      }
      // Visually remove so the user sees the effect even if a re-fetch
      // is slow.
      btn.parentElement?.remove();
    });
  });
}

// ——— Books section —————————————————————————————————————————————
async function loadBooks(user) {
  const card = document.getElementById('books-card');
  if (!card) return;
  let books = [];
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('books')
        .select('id, title, author, created_at, shop_id')
        .eq('contributor_id', user.id)
        .order('created_at', { ascending: false })
        .limit(60),
      SECTION_TIMEOUT_MS,
      'books query',
    );
    if (error) throw error;
    books = data || [];
  } catch (err) {
    sectionError('books', err);
    return;
  }

  card.innerHTML = `
    <h3 class="card-heading">Books · ${books.length}</h3>
    ${renderMyBooks(books)}
  `;
  wireDeleteBooks();
}

function renderMyBooks(books) {
  if (!books?.length) return `<div class="empty">No titles yet.</div>`;
  return (
    '<ul class="book-list">' +
    books
      .map(
        (b) => `<li>
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

function wireDeleteBooks() {
  document.querySelectorAll('[data-delete-book]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm(strings.me.deleteConfirm)) return;
      const id = btn.getAttribute('data-delete-book');
      const { error } = await supabase.from('books').delete().eq('id', id);
      if (error) {
        alert(strings.me.deleteFailed);
        return;
      }
      btn.closest('li')?.remove();
    });
  });
}

// ——— Public profile (/me.html?name=adam) ——————————————————————
async function renderOther(username) {
  let profile = null;
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('profiles')
        .select('id, username, display_name, bio')
        .eq('username', username)
        .maybeSingle(),
      SECTION_TIMEOUT_MS,
      'public profile query',
    );
    if (error) throw error;
    profile = data;
  } catch (err) {
    fatalError(err);
    return;
  }
  if (!profile) {
    root.innerHTML = `<div class="card"><h2>User not found</h2></div>`;
    return;
  }

  let photos = [],
    books = [];
  try {
    const [p, b] = await Promise.all([
      withTimeout(
        supabase
          .from('photos')
          .select('id, storage_path, thumb_path')
          .eq('uploader_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(40),
        SECTION_TIMEOUT_MS,
        'public photos',
      ),
      withTimeout(
        supabase
          .from('books')
          .select('id, title, author')
          .eq('contributor_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(40),
        SECTION_TIMEOUT_MS,
        'public books',
      ),
    ]);
    photos = p.data || [];
    books = b.data || [];
  } catch (err) {
    console.error('public profile sections failed', err);
    // Render whatever we have; sections may end up empty.
  }

  root.innerHTML = `
    <div class="card">
      <h2 style="font-size:28px;font-weight:600;letter-spacing:-0.01em">${escapeHtml(profile.display_name || profile.username)}</h2>
      <div style="font-family:var(--font-mono);font-size:11px;color:var(--ink-soft);margin-top:6px">@${escapeHtml(profile.username)}</div>
      ${profile.bio ? `<p style="margin-top:12px">${escapeHtml(profile.bio)}</p>` : ''}
    </div>
    <div class="card">
      <h3 class="card-heading">Photos</h3>
      ${renderMyPhotos(photos).replace(/<button[^>]*>delete<\/button>/g, '')}
    </div>
    <div class="card">
      <h3 class="card-heading">Books</h3>
      ${
        books.length
          ? '<ul class="book-list">' +
            books
              .map(
                (b) =>
                  `<li><span class="title">${escapeHtml(b.title)}</span><span class="author">${escapeHtml(b.author || '')}</span></li>`,
              )
              .join('') +
            '</ul>'
          : `<div class="empty">No titles yet.</div>`
      }
    </div>
  `;
}
