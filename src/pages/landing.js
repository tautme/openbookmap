import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/components.css';
import '../styles/landing.css';

import { mountFooter } from '../components/footer.js';
import { iterations } from '../data/iterations.js';
import { faq } from '../data/faq.js';
import { escapeHtml, escapeAttr } from '../lib/format.js';
import { installAnalytics } from '../lib/analytics.js';

installAnalytics();

/**
 * Landing page is intentionally vanilla-first. We render the variable
 * bits (iteration links, FAQ) from data files so new entries don't
 * require touching markup.
 */
function renderIterations() {
  const host = document.querySelector('[data-iterations]');
  if (!host) return;
  host.innerHTML = iterations
    .map(
      (it) =>
        `<a class="iter-btn" href="${escapeAttr(it.href)}" target="_blank" rel="noopener"><span class="n">${String(it.n).padStart(2, '0')}</span>${escapeHtml(it.label)}</a>`,
    )
    .join('');
}

function renderFaq() {
  const host = document.querySelector('[data-faq]');
  if (!host) return;
  host.innerHTML = faq
    .map(
      (f) => `
        <details>
          <summary>${escapeHtml(f.q)}</summary>
          <p>${f.a}</p>
        </details>`,
    )
    .join('');
}

function wireSignup() {
  const form = document.getElementById('signup-form');
  const consent = document.getElementById('signup-consent');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const emailEl = document.getElementById('signup-email');
    const email = emailEl?.value.trim();
    if (!email) return;
    // Temporary: opens the user's email client. Swap for Buttondown/Listmonk
    // when a provider is wired up. Documented behavior — not a bug.
    const subject = encodeURIComponent('OpenBookMap mailing list — subscribe');
    const body = encodeURIComponent(
      'Please add this address to the OpenBookMap mailing list: ' + email,
    );
    window.location.href = `mailto:adam@openbookmap.org?subject=${subject}&body=${body}`;
    if (consent) {
      consent.textContent =
        'Thanks — your email app should open now. Send the message to complete signup.';
    }
  });
}

renderIterations();
renderFaq();
wireSignup();
mountFooter();
