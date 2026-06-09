import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FlowView } from './FlowView';
import { makeIndex } from '../test/fixtures';

describe('FlowView', () => {
  it('renders the focus and its downstream nodes', () => {
    render(<FlowView index={makeIndex()} rootId="a" onReroot={() => {}} showInfra={false} onToggleInfra={() => {}} criticalOnly={false} onToggleCriticalOnly={() => {}} />);
    expect(screen.getByTestId('flow-node-b')).toBeInTheDocument();
  });

  it('reroots when a node is clicked', async () => {
    const onReroot = vi.fn();
    render(<FlowView index={makeIndex()} rootId="a" onReroot={onReroot} showInfra={false} onToggleInfra={() => {}} criticalOnly={false} onToggleCriticalOnly={() => {}} />);
    await userEvent.click(screen.getByTestId('flow-node-b'));
    expect(onReroot).toHaveBeenCalledWith('b');
  });

  it('switches direction without crashing', async () => {
    render(<FlowView index={makeIndex()} rootId="c" onReroot={() => {}} showInfra={false} onToggleInfra={() => {}} criticalOnly={false} onToggleCriticalOnly={() => {}} />);
    await userEvent.click(screen.getByRole('tab', { name: /upstream/i }));
    expect(screen.getByTestId('flow-node-b')).toBeInTheDocument(); // b is upstream of c
  });
});
