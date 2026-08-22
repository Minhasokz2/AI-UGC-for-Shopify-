import '@testing-library/jest-dom/vitest';

// jsdom has no layout engine, so it doesn't implement matchMedia — Polaris's
// breakpoint utilities call it on import, so every test needs this polyfill.
// jsdom also has no ResizeObserver — several Polaris components (Select's
// popover, etc.) observe their activator's size on mount.
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
