import { describe, it, expect } from 'vitest';
import { toMermaid, toMermaidSankey } from './mermaid';
import { makeIndex, makeCyclicIndex } from '../test/fixtures';
import { buildFlowLayout } from './flow';

describe('toMermaid root styling', () => {
  it('emits a focal style line for every id in rootIds', () => {
    const index = makeIndex();
    const out = toMermaid(index, ['a', 'b', 'c'], [], { rootIds: ['a', 'c'] });
    expect(out).toContain('style s_a stroke:#8ecbff');
    expect(out).toContain('style s_c stroke:#8ecbff');
    expect(out).not.toContain('style s_b stroke:#8ecbff');
  });
});

describe('toMermaidSankey', () => {
  it('emits a sankey-beta header and source,target,value rows', () => {
    const layout = buildFlowLayout(makeIndex(), 'a', { mode: 'dependencies', depth: 0, width: 800, height: 400 });
    const code = toMermaidSankey(layout);
    expect(code).toMatch(/^sankey-beta/m);
    expect(code).toContain('a,b,3');     // a->b weight 3
    expect(code).toContain('c,ext-x,1'); // leaf
  });

  it('labels ghost targets with a loop marker', () => {
    const layout = buildFlowLayout(makeCyclicIndex(), 'a', { mode: 'dependencies', depth: 0, width: 800, height: 400 });
    const code = toMermaidSankey(layout);
    expect(code).toMatch(/loop/i);
  });
});
