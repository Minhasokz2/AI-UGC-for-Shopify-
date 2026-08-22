import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

// jsdom has no layout engine, so it doesn't implement matchMedia — Polaris's
// breakpoint utilities call it on import, so any test that renders a Polaris
// component needs this polyfill. jsdom also has no ResizeObserver — several
// Polaris components (Select's popover, etc.) observe their activator's size
// on mount.
if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  global.ResizeObserver = window.ResizeObserver;
}

if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// jsdom doesn't implement crypto.randomUUID in some versions — polyfill for
// generateIdempotencyKey() tests.
if (!globalThis.crypto?.randomUUID) {
  globalThis.crypto = globalThis.crypto ?? {};
  globalThis.crypto.randomUUID = () => 'test-uuid-0000-0000-000000000000';
}
