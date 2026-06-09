import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ServiceDetailPage } from './ServiceDetailPage';
import { makeService } from '../test/fixtures';
import { CatalogIndex } from '../data/catalog';
import type { Catalog, Service } from '../types';

function indexWith(svc: Service): CatalogIndex {
  const catalog: Catalog = { generatedFrom: 'test', count: 1, services: [svc] };
  return new CatalogIndex(catalog);
}

const baseProps = {
  onBack: vi.fn(),
  onOpenMap: vi.fn(),
  onSelectNode: vi.fn(),
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ServiceDetailPage JSON editor refresh', () => {
  // Root-cause regression: the client must re-read the catalog after its own
  // write instead of relying on the dev server's data/ file-watch reload (which
  // is flaky on some platforms). The editor signals a successful save via
  // onSaved so the app can refetch; without it, a reopened editor reseeds from
  // the stale in-memory service and a removed dependency reappears.
  it('calls onSaved after a successful save', async () => {
    const svc = makeService({
      serviceId: 'a',
      name: 'Alpha',
      dependencies: [{ serviceId: 'b', interaction: 'sync-http', critical: false, purpose: 'x', external: false }],
    });
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn();

    render(<ServiceDetailPage service={svc} index={indexWith(svc)} {...baseProps} onSaved={onSaved} />);

    await userEvent.click(screen.getByRole('button', { name: 'Edit JSON' }));
    await userEvent.click(screen.getByRole('button', { name: /Validate & Save/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });

  it('does not call onSaved when the save is rejected', async () => {
    const svc = makeService({ serviceId: 'a', name: 'Alpha' });
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ json: async () => ({ ok: false, errors: ['nope'] }) });
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn();

    render(<ServiceDetailPage service={svc} index={indexWith(svc)} {...baseProps} onSaved={onSaved} />);

    await userEvent.click(screen.getByRole('button', { name: 'Edit JSON' }));
    await userEvent.click(screen.getByRole('button', { name: /Validate & Save/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(onSaved).not.toHaveBeenCalled();
  });
});
