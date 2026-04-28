/**
 * Render the site-wide footer into a `<footer data-footer>` element.
 * @param {{mount?: HTMLElement}} [options]
 */
export function mountFooter({ mount } = {}) {
  const el = mount ?? document.querySelector('[data-footer]');
  if (!el) return;
  el.classList.add('site-footer');
  el.innerHTML = `
    <div>
      OpenBookMap · A work in progress · © MMXXVI, released under open licenses
    </div>
    <div>
      <a href="/about.html">About</a>
      &nbsp;·&nbsp;
      <a href="https://github.com/tautme/openbookmap" target="_blank" rel="noopener">GitHub</a>
      &nbsp;·&nbsp;
      <a href="mailto:adam@openbookmap.org">Contact</a>
    </div>
  `;
}
