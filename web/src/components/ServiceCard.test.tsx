import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ServiceCard } from './ServiceCard';
import { makeIndex, makeService } from '../test/fixtures';

const index = makeIndex();
const svc = makeService({ serviceId: 'a', name: 'Alpha' });

describe('ServiceCard select mode', () => {
  it('clicking the card toggles selection (not open) when selectMode is on', async () => {
    const onOpen = vi.fn();
    const onToggleSelect = vi.fn();
    render(
      <ServiceCard
        service={svc}
        index={index}
        onOpen={onOpen}
        onMapView={vi.fn()}
        selectMode
        selected={false}
        onToggleSelect={onToggleSelect}
      />,
    );
    await userEvent.click(screen.getByText('Alpha'));
    expect(onToggleSelect).toHaveBeenCalledWith('a');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('clicking the card opens detail when selectMode is off', async () => {
    const onOpen = vi.fn();
    render(<ServiceCard service={svc} index={index} onOpen={onOpen} onMapView={vi.fn()} />);
    await userEvent.click(screen.getByText('Alpha'));
    expect(onOpen).toHaveBeenCalledWith('a');
  });

  it('exposes a checkbox reflecting selected state in select mode', () => {
    render(
      <ServiceCard
        service={svc}
        index={index}
        onOpen={vi.fn()}
        onMapView={vi.fn()}
        selectMode
        selected
        onToggleSelect={vi.fn()}
      />,
    );
    const cb = screen.getByRole('checkbox');
    expect(cb.getAttribute('aria-checked')).toBe('true');
  });
});
