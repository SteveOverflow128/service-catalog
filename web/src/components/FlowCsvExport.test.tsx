import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { FlowCsvExport } from './FlowCsvExport';
import { buildFlowLayout } from '../graph/flow';
import { makeIndex } from '../test/fixtures';

const layout = () => buildFlowLayout(makeIndex(), 'a', { mode: 'dependencies', depth: 0, width: 800, height: 400 });

describe('FlowCsvExport', () => {
  it('renders the CSV edge list header', () => {
    const { container } = render(<FlowCsvExport layout={layout()} filename="flow-a.csv" onClose={() => {}} />);
    expect(container.querySelector('.modal__code')?.textContent).toContain('source,target,interaction,critical,weight,hop');
  });
  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<FlowCsvExport layout={layout()} filename="flow-a.csv" onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
