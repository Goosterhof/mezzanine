// Vitest setup — mocks the Tauri IPC bridge so component and composable
// tests run cleanly in jsdom without a Tauri webview.
//
// Tests that need to assert specific invoke/listen behavior can re-mock
// these modules locally with vi.mock() at the top of their spec.

import {vi} from 'vitest';

type InvokeFn = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
type ListenFn = (eventName: string, handler: (event: unknown) => void) => Promise<() => void>;

vi.mock('@tauri-apps/api/core', () => ({invoke: vi.fn<InvokeFn>(() => Promise.resolve())}));

vi.mock('@tauri-apps/api/event', () => ({listen: vi.fn<ListenFn>(() => Promise.resolve(() => {}))}));

// jsdom does not implement ResizeObserver. SessionCanvas observes its
// terminal wrappers to re-fit on layout change; without this shim the
// component would throw on mount.
class ResizeObserverShim {
    constructor(_callback: ResizeObserverCallback) {}
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}
(globalThis as unknown as {ResizeObserver?: typeof ResizeObserver}).ResizeObserver ??=
    ResizeObserverShim as unknown as typeof ResizeObserver;
