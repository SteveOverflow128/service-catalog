import { describe, it, expect } from 'vitest';
import { parseHash, viewToHash, type AppView } from './routing';

describe('parseHash', () => {
  it('parses empty / root as catalog', () => {
    expect(parseHash('')).toEqual({ kind: 'catalog' });
    expect(parseHash('#/')).toEqual({ kind: 'catalog' });
  });
  it('parses mesh', () => {
    expect(parseHash('#/mesh')).toEqual({ kind: 'mesh' });
  });
  it('parses a detail page', () => {
    expect(parseHash('#/d/auth-service')).toEqual({ kind: 'detail', id: 'auth-service' });
  });
  it('parses a multi-root map', () => {
    expect(parseHash('#/m/auth-service,billing-api')).toEqual({
      kind: 'map',
      rootIds: ['auth-service', 'billing-api'],
    });
  });
  it('treats #/s/<id> as a single-root map (back-compat)', () => {
    expect(parseHash('#/s/auth-service')).toEqual({ kind: 'map', rootIds: ['auth-service'] });
  });
  it('falls back to catalog for an empty map', () => {
    expect(parseHash('#/m/')).toEqual({ kind: 'catalog' });
  });
  it('decodes percent-encoded ids', () => {
    expect(parseHash('#/d/a%2Fb')).toEqual({ kind: 'detail', id: 'a/b' });
  });
});

describe('viewToHash', () => {
  const cases: [AppView, string][] = [
    [{ kind: 'catalog' }, '#/'],
    [{ kind: 'mesh' }, '#/mesh'],
    [{ kind: 'detail', id: 'auth-service' }, '#/d/auth-service'],
    [{ kind: 'map', rootIds: ['auth-service', 'billing-api'] }, '#/m/auth-service,billing-api'],
  ];
  it.each(cases)('serializes %j', (view, hash) => {
    expect(viewToHash(view)).toBe(hash);
  });
  it('round-trips map and detail', () => {
    const v: AppView = { kind: 'map', rootIds: ['a', 'b', 'c'] };
    expect(parseHash(viewToHash(v))).toEqual(v);
  });
});
