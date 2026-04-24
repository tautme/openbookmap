import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/components.css';
import '../styles/contribute.css';

import { mountTopbar } from '../components/topbar.js';
import { mountFooter } from '../components/footer.js';
import { supabase, STORAGE_BUCKET } from '../lib/supabase.js';
import { strings } from '../lib/strings.js';
import { escapeHtml, escapeAttr, normalizeTitle } from '../lib/format.js';
import { showError, showSuccess, clearStatus } from '../lib/errors.js';
import { extractTitles } from '../ocr/index.js';
import { makeDerivatives } from '../images/compress.js';
import { installAnalytics } from '../lib/analytics.js';

installAnalytics();
mountTopbar({ active: 'contribute' });

// ——— Shop context from URL ———————————————————————————————————
const params = new URLSearchParams(location.search);
const shopCtx = {
  osm_type: params.get('osm_type'),
  osm_id: params.get('osm_id'),
  name: params.get('name') || '',
  lat: params.get('lat') ? parseFloat(params.get('lat')) : null,
  lon: params.get('lon') ? parseFloat(params.get('lon')) : null,
};

const root = document.getElementById('app');

// ——— Auth state ——————————————————————————————————————————————
async function currentUser() {
  const { data } = await supabase.auth.getUser();
  return data?.user ?? null;
}

supabase.auth.onAuthStateChange(() => {
  render();
});

// ——— Top-level renderer ——————————————————————————————————————
async function render() {
  const user = await currentUser();
  if (!user) {
    root.innerHTML = renderSignInView();
    wireSignIn();
    return;
  }
  if (!shopCtx.osm_type || !shopCtx.osm_id) {
    root.innerHTML = renderPickShopView(user);
    wireSignOut();
    return;
  }
  root.innerHTML = renderUploadView(user);
  wireSignOut();
  wireUploader();
}

// ——— Views ———————————————————————————————————————————————————
function renderSignInView(mode = 'signin') {
  const isSignUp = mode === 'signup';
  return `
    <div class="card auth-form" data-auth-mode="${mode}">
      <h2>${escapeHtml(isSignUp ? strings.contribute.signUp : strings.contribute.signInTitle)}</h2>
      <p>${escapeHtml(strings.contribute.signInLede)}</p>
      <label for="auth-email">${escapeHtml(strings.contribute.emailLabel)}</label>
      <input id="auth-email" class="input" type="email" autocomplete="email" required />
      <label for="auth-password">${escapeHtml(strings.contribute.passwordLabel)}</label>
      <input id="auth-password" class="input" type="password" autocomplete="${isSignUp ? 'new-password' : 'current-password'}" required minlength="8" />
      <div id="auth-status" hidden></div>
      <div class="auth-actions">
        <button class="btn stamp" id="auth-submit" type="button">
          ${escapeHtml(isSignUp ? strings.contribute.signUp : strings.contribute.signIn)}
        </button>
        <button class="btn secondary" id="auth-switch" type="button">
          ${escapeHtml(isSignUp ? strings.contribute.switchToSignIn : strings.contribute.switchToSignUp)}
        </button>
      </div>
    </div>
  `;
}

function renderPickShopView(user) {
  return `
    <div class="card">
      <p>${escapeHtml(strings.contribute.signedInAs(user.email))} · <a href="#" id="signout">${escapeHtml(strings.contribute.signOut)}</a></p>
      <h2>${escapeHtml(strings.contribute.needShop)}</h2>
      <p>
        <a class="btn stamp" href="/map.html">${escapeHtml(strings.nav.map)} →</a>
      </p>
    </div>
  `;
}

function renderUploadView(user) {
  return `
    <div class="card">
      <p style="margin:0;font-size:13px;color:var(--ink-soft)">
        ${escapeHtml(strings.contribute.signedInAs(user.email))} ·
        <a href="#" id="signout">${escapeHtml(strings.contribute.signOut)}</a>
      </p>
    </div>
    <div class="shop-header">
      <div class="label">Contributing to</div>
      <div class="name">${escapeHtml(shopCtx.name || 'Selected shop')}</div>
      <div style="font-family:var(--font-mono);font-size:11px;color:var(--ink-soft);margin-top:4px">
        OSM ${escapeHtml(shopCtx.osm_type)}/${escapeHtml(shopCtx.osm_id)}
      </div>
    </div>

    <div class="card">
      <label class="dropzone" id="dropzone">
        <div style="font-size:16px;margin-bottom:8px">${escapeHtml(strings.contribute.dropzone)}</div>
        <div class="license-note" style="margin:0;border:none;padding:0">
          ${escapeHtml(strings.contribute.licenseNote)}
        </div>
        <input type="file" id="file-input" accept="image/*" multiple />
      </label>
      <div id="photo-list"></div>
      <div id="upload-status" hidden></div>
      <div class="auth-actions">
        <button class="btn stamp" id="save-btn" type="button" disabled>Save contribution</button>
      </div>
    </div>
  `;
}

// ——— Wiring ——————————————————————————————————————————————————
function wireSignIn() {
  const statusEl = document.getElementById('auth-status');
  const switchBtn = document.getElementById('auth-switch');
  const submitBtn = document.getElementById('auth-submit');
  const card = root.querySelector('[data-auth-mode]');

  switchBtn.addEventListener('click', () => {
    const next = card.dataset.authMode === 'signin' ? 'signup' : 'signin';
    root.innerHTML = renderSignInView(next);
    wireSignIn();
  });

  submitBtn.addEventListener('click', async () => {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    if (!email || !password || password.length < 8) {
      showError(statusEl, 'Enter an email and a password of at least 8 characters.');
      return;
    }
    submitBtn.disabled = true;
    clearStatus(statusEl);
    try {
      const mode = card.dataset.authMode;
      const fn = mode === 'signup' ? supabase.auth.signUp : supabase.auth.signInWithPassword;
      const { error } = await fn.call(supabase.auth, { email, password });
      if (error) throw error;
      showSuccess(statusEl, mode === 'signup' ? 'Account created.' : 'Signed in.');
      // onAuthStateChange will re-render.
    } catch (err) {
      showError(statusEl, err.message || strings.errors.generic, err);
      submitBtn.disabled = false;
    }
  });
}

function wireSignOut() {
  const link = document.getElementById('signout');
  if (!link) return;
  link.addEventListener('click', async (e) => {
    e.preventDefault();
    await supabase.auth.signOut();
  });
}

// ——— Upload flow ————————————————————————————————————————————————

/** @type {Array<{file: File, display?: Blob, thumb?: Blob, titles: Array<{title:string, author:string}>, raw: string, status: string}>} */
let photos = [];

function wireUploader() {
  const fileInput = document.getElementById('file-input');
  const dropzone = document.getElementById('dropzone');
  const list = document.getElementById('photo-list');
  const statusEl = document.getElementById('upload-status');
  const saveBtn = document.getElementById('save-btn');

  fileInput.addEventListener('change', (e) => addFiles(e.target.files));
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('drag');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag');
    addFiles(e.dataTransfer.files);
  });

  async function addFiles(fileList) {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'));
    for (const file of files) {
      const entry = {
        file,
        titles: [],
        raw: '',
        status: strings.contribute.ocrPending,
      };
      photos.push(entry);
    }
    renderPhotos();
    saveBtn.disabled = photos.length === 0;
    for (const entry of photos) {
      if (entry.display) continue; // already processed
      await processOne(entry);
      renderPhotos();
    }
  }

  async function processOne(entry) {
    try {
      entry.status = strings.contribute.ocrRunning;
      renderPhotos();
      const [derivatives, ocrResult] = await Promise.all([
        makeDerivatives(entry.file),
        extractTitles(entry.file).catch((err) => {
          console.error('OCR failed', err);
          return { raw: '', titles: [] };
        }),
      ]);
      entry.display = derivatives.display;
      entry.thumb = derivatives.thumb;
      entry.raw = ocrResult.raw;
      entry.titles = ocrResult.titles.map((t) => ({ title: normalizeTitle(t), author: '' }));
      entry.status =
        entry.titles.length > 0 ? strings.contribute.ocrDone : strings.contribute.ocrFailed;
    } catch (err) {
      entry.status = strings.contribute.ocrFailed;
      console.error(err);
    }
  }

  function renderPhotos() {
    list.innerHTML = photos
      .map(
        (entry, idx) => `
          <div class="photo-preview" data-photo-idx="${idx}">
            <img class="thumb" src="${escapeAttr(URL.createObjectURL(entry.file))}" alt="" />
            <div class="info">
              <div class="ocr-status ${entry.titles.length ? 'done' : ''}">${escapeHtml(entry.status)}</div>
              <ul class="title-list">
                ${entry.titles
                  .map(
                    (t, tIdx) => `
                  <li data-t-idx="${tIdx}">
                    <input type="text" value="${escapeAttr(t.title)}" placeholder="Title" data-field="title" />
                    <input type="text" value="${escapeAttr(t.author)}" placeholder="Author" class="author" data-field="author" />
                    <button class="remove" type="button" aria-label="${escapeAttr(strings.contribute.removeTitle)}">×</button>
                  </li>`,
                  )
                  .join('')}
              </ul>
              <button class="btn secondary add-title" type="button">${escapeHtml(strings.contribute.addTitle)}</button>
            </div>
          </div>`,
      )
      .join('');
    wirePhotoInputs();
  }

  function wirePhotoInputs() {
    list.querySelectorAll('[data-photo-idx]').forEach((node) => {
      const idx = Number(node.dataset.photoIdx);
      const entry = photos[idx];
      node.querySelectorAll('li[data-t-idx]').forEach((li) => {
        const tIdx = Number(li.dataset.tIdx);
        li.querySelector('input[data-field="title"]').addEventListener('input', (e) => {
          entry.titles[tIdx].title = e.target.value;
        });
        li.querySelector('input[data-field="author"]').addEventListener('input', (e) => {
          entry.titles[tIdx].author = e.target.value;
        });
        li.querySelector('.remove').addEventListener('click', () => {
          entry.titles.splice(tIdx, 1);
          renderPhotos();
        });
      });
      node.querySelector('.add-title').addEventListener('click', () => {
        entry.titles.push({ title: '', author: '' });
        renderPhotos();
      });
    });
  }

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    clearStatus(statusEl);
    showSuccess(statusEl, strings.contribute.uploading);
    try {
      await saveContribution();
      showSuccess(statusEl, strings.contribute.uploadSuccess);
      photos = [];
      renderPhotos();
    } catch (err) {
      showError(statusEl, err.message || strings.contribute.uploadFailed, err);
      saveBtn.disabled = false;
    }
  });
}

async function saveContribution() {
  const user = await currentUser();
  if (!user) throw new Error(strings.errors.notSignedIn);

  // 1. Upsert the shop row keyed on (osm_type, osm_id).
  const { data: shop, error: shopErr } = await supabase
    .from('shops')
    .upsert(
      {
        osm_type: shopCtx.osm_type,
        osm_id: shopCtx.osm_id,
        name: shopCtx.name,
        lat: shopCtx.lat ?? 0,
        lon: shopCtx.lon ?? 0,
      },
      { onConflict: 'osm_type,osm_id' },
    )
    .select('id')
    .single();
  if (shopErr) throw shopErr;

  // 2. For each photo: upload display + thumb, then insert row + books.
  for (const entry of photos) {
    if (!entry.display) continue;
    const photoId = crypto.randomUUID();
    const baseDir = `${shop.id}/${photoId}`;
    const displayPath = `${baseDir}/display_1600.jpg`;
    const thumbPath = `${baseDir}/thumb_400.jpg`;

    const [dispUp, thumbUp] = await Promise.all([
      supabase.storage
        .from(STORAGE_BUCKET)
        .upload(displayPath, entry.display, { contentType: 'image/jpeg' }),
      supabase.storage
        .from(STORAGE_BUCKET)
        .upload(thumbPath, entry.thumb, { contentType: 'image/jpeg' }),
    ]);
    if (dispUp.error) throw dispUp.error;
    if (thumbUp.error) throw thumbUp.error;

    const { error: photoErr } = await supabase.from('photos').insert({
      id: photoId,
      shop_id: shop.id,
      uploader_id: user.id,
      storage_path: displayPath,
      thumb_path: thumbPath,
    });
    if (photoErr) throw photoErr;

    const bookRows = entry.titles
      .map((t) => ({
        title: normalizeTitle(t.title),
        author: t.author?.trim() || null,
      }))
      .filter((b) => b.title && b.title.length >= 2)
      .map((b) => ({
        shop_id: shop.id,
        photo_id: photoId,
        title: b.title,
        author: b.author,
        raw_ocr_text: entry.raw || null,
        confirmed: true,
        contributor_id: user.id,
      }));
    if (bookRows.length) {
      const { error: bookErr } = await supabase.from('books').insert(bookRows);
      if (bookErr) throw bookErr;
    }

    await supabase.from('contributions').insert({
      user_id: user.id,
      action: 'upload_photo',
      target_type: 'photo',
      target_id: photoId,
    });
  }
}

mountFooter();
render();
