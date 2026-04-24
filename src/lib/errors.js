import { escapeHtml } from './format.js';

/**
 * Show a user-visible error in a designated `<div>` or similar element.
 * Also logs the underlying error to the console for debugging.
 * @param {HTMLElement|null} el
 * @param {string} message
 * @param {unknown} [cause]
 */
export function showError(el, message, cause) {
  if (cause !== undefined) {
    console.error(message, cause);
  }
  if (!el) return;
  el.classList.remove('success');
  el.classList.add('status', 'error');
  el.textContent = message;
  el.hidden = false;
}

/**
 * Show a success message in a status element.
 * @param {HTMLElement|null} el
 * @param {string} message
 */
export function showSuccess(el, message) {
  if (!el) return;
  el.classList.remove('error');
  el.classList.add('status', 'success');
  el.textContent = message;
  el.hidden = false;
}

/** Clear a status element. */
export function clearStatus(el) {
  if (!el) return;
  el.textContent = '';
  el.hidden = true;
}

/**
 * Render an inline, dismissable error block as HTML.
 * Useful when we have to build a section's content from scratch.
 */
export function errorHtml(message) {
  return `<div class="status error">${escapeHtml(message)}</div>`;
}
