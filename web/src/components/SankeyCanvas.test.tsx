import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SankeyCanvas } from './SankeyCanvas';
import { buildFlowLayout } from '../graph/flow';
import { makeIndex } from '../test/fixtures';

function layout() {
  return buildFlowLayout(makeIndex(), 'a', { mode: 'dependencies', depth: 0, width: 800, height: 400 });
}

describe('SankeyCanvas', () => {
  it('renders a node rect for each service', () => {
    render(<SankeyCanvas layout={layout()} colorScheme="criticality" onReroot={() => {}} />);
    expect(screen.getByTestId('flow-node-b')).toBeInTheDocument();
    expect(screen.getByTestId('flow-node-c')).toBeInTheDocument();
  });

  it('reroots on node click', async () => {
    const onReroot = vi.fn();
    render(<SankeyCanvas layout={layout()} colorScheme="criticality" onReroot={onReroot} />);
    await userEvent.click(screen.getByTestId('flow-node-b'));
    expect(onReroot).toHaveBeenCalledWith('b');
  });
});
