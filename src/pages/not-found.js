import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/components.css';

import { mountTopbar } from '../components/topbar.js';
import { mountFooter } from '../components/footer.js';
import { installAnalytics } from '../lib/analytics.js';

installAnalytics();
mountTopbar({});
mountFooter();
