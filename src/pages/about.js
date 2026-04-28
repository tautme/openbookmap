import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/components.css';
import '../styles/landing.css';

import { mountTopbar } from '../components/topbar.js';
import { mountFooter } from '../components/footer.js';
import { faq } from '../data/faq.js';
import { escapeHtml } from '../lib/format.js';
import { installAnalytics } from '../lib/analytics.js';

installAnalytics();
mountTopbar({ active: 'about' });
mountFooter();

const faqHost = document.querySelector('[data-faq]');
if (faqHost) {
  faqHost.innerHTML = faq
    .map(
      (f) => `
        <details>
          <summary>${escapeHtml(f.q)}</summary>
          <p>${f.a}</p>
        </details>`,
    )
    .join('');
}
