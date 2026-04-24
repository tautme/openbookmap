/**
 * Load GoatCounter — a privacy-respecting, cookieless analytics service.
 * https://www.goatcounter.com/
 *
 * No-op if `VITE_GOATCOUNTER_CODE` is not set (local dev, previews, etc.).
 * Respects Do-Not-Track: users who set DNT are never counted.
 */
export function installAnalytics() {
  const code = import.meta.env.VITE_GOATCOUNTER_CODE;
  if (!code) return;
  if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return;
  if (document.querySelector('script[data-goatcounter]')) return;

  const s = document.createElement('script');
  s.async = true;
  s.dataset.goatcounter = `https://${code}.goatcounter.com/count`;
  s.src = '//gc.zgo.at/count.js';
  document.head.appendChild(s);
}
