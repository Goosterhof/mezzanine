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

// jsdom does not implement HTMLCanvasElement.getContext. xterm.js asks for
// a 2d context during color allocation. Returning a minimal stub silences
// the "Not implemented" stderr noise; the tests do not exercise rendered
// glyphs, only the data + DOM surface around xterm.
type CanvasProto = {getContext: HTMLCanvasElement['getContext']};
if (typeof HTMLCanvasElement !== 'undefined') {
    const proto = HTMLCanvasElement.prototype as unknown as CanvasProto;
    proto.getContext = (() => null) as HTMLCanvasElement['getContext'];
}

// jsdom does not implement window.matchMedia. xterm.js uses it to detect
// device-pixel-ratio changes when terminals open. A minimal stub returning a
// non-matching MediaQueryList is sufficient for ScientistCanvas mounts.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
    window.matchMedia = (query: string): MediaQueryList =>
        ({
            matches: false,
            media: query,
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
        }) as MediaQueryList;
}

// Silence the "onScopeDispose() is called when there is no active effect scope"
// Vue warning that fires when composables registered with onScopeDispose are
// invoked from a beforeEach hook (outside any component lifecycle). The
// behaviour is correct — there is simply no scope to dispose with.
type WarnFn = (first?: unknown, ...rest: readonly unknown[]) => void;
const consoleRef = globalThis.console as unknown as {warn: WarnFn};
const originalWarn: WarnFn = consoleRef.warn.bind(consoleRef);
consoleRef.warn = (first?: unknown, ...rest: readonly unknown[]): void => {
    if (
        typeof first === 'string' &&
        first.includes('onScopeDispose() is called when there is no active effect scope')
    ) {
        return;
    }
    originalWarn(first, ...rest);
};
