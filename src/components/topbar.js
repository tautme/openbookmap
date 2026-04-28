import { strings } from '../lib/strings.js';

/**
 * Mount the topbar into a `<header data-topbar>` element. The `active`
 * param highlights one nav item (one of 'about' | 'map' | 'search' | 'contribute' | 'me').
 *
 * @param {{active?: string, mount?: HTMLElement}} [options]
 */
export function mountTopbar({ active, mount } = {}) {
  const el = mount ?? document.querySelector('[data-topbar]');
  if (!el) return;
  el.classList.add('topbar');
  el.innerHTML = renderTopbar(active);
}

function renderTopbar(active) {
  const { nav, app } = strings;
  const isActive = (k) => (k === active ? ' active' : '');
  return `
    <a href="/" class="brand">${app.name}<span class="dot">.</span></a>
    <nav>
      <a href="/about.html" class="always-show${isActive('about')}">${nav.about}</a>
      <a href="/map.html" class="always-show${isActive('map')}">${nav.map}</a>
      <a href="/search.html"${isActive('search') ? ' class="active"' : ''}>${nav.search}</a>
      <a href="/me.html"${isActive('me') ? ' class="active"' : ''}>${nav.me}</a>
      <a href="/contribute.html" class="cta${active === 'contribute' ? ' active' : ''}">${nav.contribute}</a>
    </nav>
  `;
}
