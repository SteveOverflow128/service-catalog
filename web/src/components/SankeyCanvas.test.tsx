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

  it('does not reroot when an external node is clicked', async () => {
    const onReroot = vi.fn();
    render(<SankeyCanvas layout={layout()} colorScheme="criticality" onReroot={onReroot} />);
    await userEvent.click(screen.getByTestId('flow-node-ext-x'));
    expect(onReroot).not.toHaveBeenCalled();
  });

  it('zooms in via the toolbar, scaling the content group', async () => {
    render(<SankeyCanvas layout={layout()} colorScheme="criticality" onReroot={() => {}} />);
    const viewport = screen.getByTestId('sankey-viewport');
    expect(viewport.getAttribute('transform')).toBe('translate(0 0) scale(1)');
    await userEvent.click(screen.getByLabelText('Zoom in'));
    const t = viewport.getAttribute('transform') ?? '';
    const k = Number(t.match(/scale\(([^)]+)\)/)?.[1]);
    expect(k).toBeGreaterThan(1);
  });

  it('fit resets the pan/zoom transform', async () => {
    render(<SankeyCanvas layout={layout()} colorScheme="criticality" onReroot={() => {}} />);
    await userEvent.click(screen.getByLabelText('Zoom in'));
    await userEvent.click(screen.getByLabelText('Zoom out'));
    await userEvent.click(screen.getByLabelText('Fit to view'));
    expect(screen.getByTestId('sankey-viewport').getAttribute('transform')).toBe('translate(0 0) scale(1)');
  });
});
