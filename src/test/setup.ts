import '@testing-library/jest-dom/vitest';

// jsdom exposes scrollTo but reports every call as an unimplemented browser API. A writable no-op
// keeps route-scroll effects quiet while allowing individual resilience tests to replace it.
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'scrollTo', {
    configurable: true,
    writable: true,
    value: () => undefined,
  });
}
