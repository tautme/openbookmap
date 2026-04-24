import { createClient } from '@supabase/supabase-js';

/**
 * Single Supabase client for the whole app.
 *
 * The URL and anon key are public — Row Level Security enforces permissions.
 * They are injected at build time from `.env` via Vite's `import.meta.env`.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Fail fast and loud in the console. Pages that depend on Supabase should
  // also surface a visible error via `showError` from `./errors.js`.
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.');
}

export const supabase = createClient(url ?? '', anonKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

export const STORAGE_BUCKET = 'shelf-photos';

/** Get the public URL for a path in the shelf-photos bucket. */
export function publicUrl(path) {
  if (!path) return '';
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
