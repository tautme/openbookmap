import { describe, it, expect } from 'vitest';
import { splitOcrIntoTitles } from '../src/ocr/index.js';

describe('splitOcrIntoTitles', () => {
  it('splits on newlines and trims', () => {
    const raw = `The Great Gatsby
F. Scott Fitzgerald

  Moby-Dick  `;
    expect(splitOcrIntoTitles(raw)).toEqual([
      'The Great Gatsby',
      'F. Scott Fitzgerald',
      'Moby-Dick',
    ]);
  });

  it('drops very short and purely-numeric lines', () => {
    const raw = `ab
123
The Road`;
    expect(splitOcrIntoTitles(raw)).toEqual(['The Road']);
  });

  it('dedupes case-insensitively, preserving first casing', () => {
    expect(splitOcrIntoTitles('Solaris\nSOLARIS\nsolaris')).toEqual(['Solaris']);
  });

  it('returns [] for empty input', () => {
    expect(splitOcrIntoTitles('')).toEqual([]);
    expect(splitOcrIntoTitles(null)).toEqual([]);
  });

  it('collapses inner whitespace', () => {
    expect(splitOcrIntoTitles('Gravity\t\tRainbow')).toEqual(['Gravity Rainbow']);
  });
});
