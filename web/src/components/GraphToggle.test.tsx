import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GraphToggle } from './GraphToggle';

describe('GraphToggle', () => {
  function setup(on: boolean, onToggle = () => {}) {
    return render(
      <GraphToggle
        on={on}
        onToggle={onToggle}
        icon={<svg data-testid="ico" />}
        label="Critical only"
        titleOn="Show all dependencies"
        titleOff="Hide non-critical dependencies"
        tone="critical"
      />,
    );
  }

  it('reflects pressed state and on-title when on', () => {
    setup(true);
    const btn = screen.getByRole('button', { name: /critical only/i });
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    expect(btn).toHaveAttribute('title', 'Show all dependencies');
    expect(btn.className).toContain('graphtoggle--on');
    expect(btn.className).toContain('graphtoggle--critical');
  });

  it('shows off-title and is not pressed when off', () => {
    setup(false);
    const btn = screen.getByRole('button', { name: /critical only/i });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect(btn).toHaveAttribute('title', 'Hide non-critical dependencies');
    expect(btn.className).not.toContain('graphtoggle--on');
    expect(btn.className).toContain('graphtoggle--critical'); // tone class present even when off (CSS compound selector needs it)
  });

  it('calls onToggle on click', async () => {
    const onToggle = vi.fn();
    setup(false, onToggle);
    await userEvent.click(screen.getByRole('button', { name: /critical only/i }));
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
