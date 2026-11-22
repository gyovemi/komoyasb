import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Global mock for Tauri IPC — prevents real backend calls
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Global mock for Tauri Window API
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
  })),
}));

// Global mock for Tauri Events API
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(vi.fn())),
  emit: vi.fn(() => Promise.resolve()),
}));

// JSDOM missing prototype methods
window.HTMLElement.prototype.scrollIntoView = vi.fn();
