import { describe, it, expect } from 'vitest';
import { readMapState, parseShopRef } from '../src/lib/url-state.js';

describe('parseShopRef', () => {
  it('parses valid refs', () => {
    expect(parseShopRef('node/123')).toEqual({ type: 'node', id: '123' });
    expect(parseShopRef('way/4567')).toEqual({ type: 'way', id: '4567' });
    expect(parseShopRef('relation/89')).toEqual({ type: 'relation', id: '89' });
  });
  it('rejects invalid inputs', () => {
    expect(parseShopRef('')).toBeNull();
    expect(parseShopRef(null)).toBeNull();
    expect(parseShopRef('nope/1')).toBeNull();
    expect(parseShopRef('node/')).toBeNull();
    expect(parseShopRef('node/abc')).toBeNull();
    expect(parseShopRef('node/12/extra')).toBeNull();
  });
});

describe('readMapState', () => {
  it('returns nulls for empty search', () => {
    expect(readMapState('')).toEqual({ lat: null, lon: null, z: null, shop: null });
  });
  it('parses full state', () => {
    expect(readMapState('?lat=48.85&lon=2.35&z=13&shop=node/42')).toEqual({
      lat: 48.85,
      lon: 2.35,
      z: 13,
      shop: { type: 'node', id: '42' },
    });
  });
  it('ignores invalid numbers', () => {
    expect(readMapState('?lat=abc&z=xx')).toEqual({ lat: null, lon: null, z: null, shop: null });
  });
});
