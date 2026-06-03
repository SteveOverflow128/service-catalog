import { describe, it, expect } from 'vitest';
import { flowToCsv } from './flowCsv';
import { buildFlowLayout } from './flow';
import { makeIndex } from '../test/fixtures';

describe('flowToCsv', () => {
  it('emits a header and one row per link', () => {
    const layout = buildFlowLayout(makeIndex(), 'a', { mode: 'dependencies', depth: 0, width: 800, height: 400 });
    const csv = flowToCsv(layout);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('source,target,interaction,critical,weight,hop');
    expect(lines.length).toBe(1 + layout.links.length);
    expect(csv).toContain('a,b,sync-http,false,3,1');
  });
});
