import { describe, it, expect } from 'vitest';
import { escapeHtml, normalizeTitle, plural, timeAgo } from '../src/lib/format.js';

describe('escapeHtml', () => {
  it('escapes the five special characters', () => {
    expect(escapeHtml(`<script>alert("x&y")</script>`)).toBe(
      '&lt;script&gt;alert(&quot;x&amp;y&quot;)&lt;/script&gt;',
    );
    expect(escapeHtml(`it's`)).toBe('it&#39;s');
  });
  it('handles null and undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('normalizeTitle', () => {
  it('trims, collapses whitespace, strips quotes/brackets', () => {
    expect(normalizeTitle('  "The Great Gatsby"  ')).toBe('The Great Gatsby');
    expect(normalizeTitle('[The   Road]')).toBe('The Road');
    expect(normalizeTitle('“Moby-Dick”')).toBe('Moby-Dick');
  });
  it('is idempotent', () => {
    const n1 = normalizeTitle('  Infinite  Jest  ');
    expect(normalizeTitle(n1)).toBe(n1);
  });
  it('handles empty input', () => {
    expect(normalizeTitle('')).toBe('');
    expect(normalizeTitle(null)).toBe('');
  });
});

describe('plural', () => {
  it('handles singular', () => {
    expect(plural(1, 'book')).toBe('1 book');
  });
  it('adds default s for plurals', () => {
    expect(plural(0, 'book')).toBe('0 books');
    expect(plural(3, 'book')).toBe('3 books');
  });
  it('takes an explicit plural', () => {
    expect(plural(2, 'shelf', 'shelves')).toBe('2 shelves');
  });
});

describe('timeAgo', () => {
  it('formats recent timestamps', () => {
    expect(timeAgo(new Date())).toMatch(/just now|sec|min/);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    expect(timeAgo(oneHourAgo)).toMatch(/h ago/);
  });
  it('returns empty string for invalid input', () => {
    expect(timeAgo('not-a-date')).toBe('');
  });
});
