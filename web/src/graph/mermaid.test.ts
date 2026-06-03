import { describe, it, expect } from 'vitest';
import { toMermaid } from './mermaid';
import { makeIndex } from '../test/fixtures';

describe('toMermaid root styling', () => {
  it('emits a focal style line for every id in rootIds', () => {
    const index = makeIndex();
    const out = toMermaid(index, ['a', 'b', 'c'], [], { rootIds: ['a', 'c'] });
    expect(out).toContain('style s_a stroke:#8ecbff');
    expect(out).toContain('style s_c stroke:#8ecbff');
    expect(out).not.toContain('style s_b stroke:#8ecbff');
  });
});
