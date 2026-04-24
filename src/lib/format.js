/** Escape HTML-special characters so untrusted strings can go into innerHTML. */
export function escapeHtml(s) {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

/** Alias for `escapeHtml`; kept for readability at attribute sites. */
export const escapeAttr = escapeHtml;

/**
 * Relative "time ago" with day-level granularity. English-only.
 * @param {string|Date} when
 */
export function timeAgo(when) {
  const d = when instanceof Date ? when : new Date(when);
  if (Number.isNaN(d.getTime())) return '';
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} d ago`;
  const wks = Math.floor(days / 7);
  if (wks < 5) return `${wks} wk ago`;
  const mos = Math.floor(days / 30);
  if (mos < 12) return `${mos} mo ago`;
  const yrs = Math.floor(days / 365);
  return `${yrs} yr ago`;
}

/**
 * Normalize a book title: trim, collapse whitespace, strip surrounding
 * quotation marks and brackets. Idempotent.
 * @param {string} raw
 */
export function normalizeTitle(raw) {
  if (!raw) return '';
  return String(raw)
    .replace(/\s+/g, ' ')
    .replace(/^[\s"'“”‘’([{]+|[\s"'“”‘’)\]}]+$/g, '')
    .trim();
}

/**
 * Pluralize "thing"/"things" by count. English only for now.
 * @param {number} n
 * @param {string} singular
 * @param {string} [plural]
 */
export function plural(n, singular, plural) {
  return n === 1 ? `${n} ${singular}` : `${n} ${plural ?? singular + 's'}`;
}
