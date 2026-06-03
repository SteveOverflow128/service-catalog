import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CatalogView } from './CatalogView';
import { emptyFilters } from './Filters';
import { deriveFacets } from '../data/catalog';
import { makeIndex } from '../test/fixtures';

function renderCatalog(onMapSelected = vi.fn()) {
  const index = makeIndex();
  render(
    <CatalogView
      index={index}
      facets={deriveFacets(index.services)}
      query=""
      filters={emptyFilters()}
      onToggle={vi.fn()}
      onClear={vi.fn()}
      onOpen={vi.fn()}
      onMapView={vi.fn()}
      onMapSelected={onMapSelected}
    />,
  );
  return { onMapSelected };
}

describe('CatalogView multi-select', () => {
  it('shows the selection bar only after enabling Select multiple', async () => {
    renderCatalog();
    expect(screen.queryByText(/selected/i)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /select multiple/i }));
    expect(screen.getByText(/0 selected/i)).toBeTruthy();
  });

  it('enables Map selected once cards are checked and passes their ids', async () => {
    const { onMapSelected } = renderCatalog();
    await userEvent.click(screen.getByRole('button', { name: /select multiple/i }));

    const mapSelected = screen.getByRole('button', { name: /map selected/i });
    expect(mapSelected).toBeDisabled();

    await userEvent.click(screen.getByRole('checkbox', { name: /select a/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: /select c/i }));
    expect(mapSelected).not.toBeDisabled();

    await userEvent.click(mapSelected);
    expect(onMapSelected).toHaveBeenCalledWith(['a', 'c']);
  });

  it('Clear empties the selection', async () => {
    renderCatalog();
    await userEvent.click(screen.getByRole('button', { name: /select multiple/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: /select a/i }));
    expect(screen.getByText(/1 selected/i)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /^clear$/i }));
    expect(screen.getByText(/0 selected/i)).toBeTruthy();
  });
});
