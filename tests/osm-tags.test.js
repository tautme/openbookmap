import { describe, it, expect } from 'vitest';
import { formatOsmAddress, pickName, pickWebsite, getLatLon } from '../src/lib/osm-tags.js';

describe('formatOsmAddress', () => {
  it('joins street, city, country in order', () => {
    expect(
      formatOsmAddress({
        'addr:street': '10 rue de Seine',
        'addr:city': 'Paris',
        'addr:country': 'FR',
      }),
    ).toBe('10 rue de Seine, Paris, FR');
  });
  it('omits missing parts', () => {
    expect(formatOsmAddress({ 'addr:city': 'Paris' })).toBe('Paris');
    expect(formatOsmAddress({})).toBe('');
  });
  it('tolerates missing argument', () => {
    expect(formatOsmAddress()).toBe('');
  });
});

describe('pickName', () => {
  it('prefers name over brand', () => {
    expect(pickName({ name: 'Shakespeare & Co.', brand: 'Shakespeare' })).toBe('Shakespeare & Co.');
  });
  it('falls back to name:en, then brand, then default', () => {
    expect(pickName({ 'name:en': 'Book Shop' })).toBe('Book Shop');
    expect(pickName({ brand: 'Chain' })).toBe('Chain');
    expect(pickName({}, 'nope')).toBe('nope');
  });
});

describe('pickWebsite', () => {
  it('prefers website over contact:website', () => {
    expect(pickWebsite({ website: 'a', 'contact:website': 'b' })).toBe('a');
    expect(pickWebsite({ 'contact:website': 'b' })).toBe('b');
    expect(pickWebsite({})).toBe('');
  });
});

describe('getLatLon', () => {
  it('reads lat/lon from a node', () => {
    expect(getLatLon({ lat: 1, lon: 2 })).toEqual({ lat: 1, lon: 2 });
  });
  it('reads from center for ways/relations', () => {
    expect(getLatLon({ center: { lat: 3, lon: 4 } })).toEqual({ lat: 3, lon: 4 });
  });
  it('returns null when neither is present', () => {
    expect(getLatLon({})).toBeNull();
    expect(getLatLon(undefined)).toBeNull();
  });
});
