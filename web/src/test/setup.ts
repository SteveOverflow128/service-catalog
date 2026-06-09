import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Unmount React trees between tests so the jsdom document stays clean.
afterEach(cleanup);

// jsdom doesn't implement scrollIntoView; components that scroll-on-open would
// otherwise throw an unhandled error during tests.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}
