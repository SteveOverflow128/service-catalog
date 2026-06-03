import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RootsSidebar } from './RootsSidebar';
import { makeIndex } from '../test/fixtures';

describe('RootsSidebar', () => {
  it('lists a row per root and removes via ✕', async () => {
    const index = makeIndex();
    const onRemove = vi.fn();
    const onOpen = vi.fn();
    render(<RootsSidebar index={index} rootIds={['a', 'b']} onRemove={onRemove} onOpenDetail={onOpen} />);

    expect(screen.getByText('2 roots')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Remove a' }));
    expect(onRemove).toHaveBeenCalledWith('a');
  });

  it('opens detail when a root row is clicked', async () => {
    const index = makeIndex();
    const onOpen = vi.fn();
    render(<RootsSidebar index={index} rootIds={['a']} onRemove={vi.fn()} onOpenDetail={onOpen} />);
    await userEvent.click(screen.getByRole('button', { name: /open a/i }));
    expect(onOpen).toHaveBeenCalledWith('a');
  });
});
