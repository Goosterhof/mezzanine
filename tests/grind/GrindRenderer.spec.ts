import {mount} from '@vue/test-utils';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import GrindRenderer from '../../src/grind/GrindRenderer.vue';
import {useGrind} from '../../src/grind/useGrind';

// --- Reduced-Motion Gate harness (WR-0089) ---------------------------------
// The global tests/setup.ts stubs window.matchMedia to a non-matching
// MediaQueryList. These tests install a controllable stub so we can flip
// `matches` and fire the `change` event the gate subscribes to. We also stub
// requestAnimationFrame so we can assert whether the RAF loop re-schedules
// (the load-bearing behaviour: under reduced motion it must NOT).

type ChangeHandler = (e: MediaQueryListEvent) => void;

type ListenerFn = (type: string, handler: ChangeHandler) => void;

interface FakeMediaQuery {
    matches: boolean;
    handlers: ChangeHandler[];
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
    fire(matches: boolean): void;
}

function installMatchMedia(initialMatches: boolean): FakeMediaQuery {
    const mq: FakeMediaQuery = {
        matches: initialMatches,
        handlers: [],
        addEventListener: vi.fn<ListenerFn>((_type: string, handler: ChangeHandler) => {
            mq.handlers.push(handler);
        }),
        removeEventListener: vi.fn<ListenerFn>((_type: string, handler: ChangeHandler) => {
            mq.handlers = mq.handlers.filter((h) => h !== handler);
        }),
        fire(matches: boolean): void {
            mq.matches = matches;
            for (const h of mq.handlers) {
                h({matches} as MediaQueryListEvent);
            }
        },
    };
    window.matchMedia = vi.fn<(query: string) => MediaQueryList>(
        (query: string) =>
            ({
                matches: mq.matches,
                media: query,
                onchange: null,
                addListener: () => {},
                removeListener: () => {},
                addEventListener: mq.addEventListener,
                removeEventListener: mq.removeEventListener,
                dispatchEvent: () => false,
            }) as unknown as MediaQueryList,
    );
    return mq;
}

describe('GrindRenderer reduced-motion gate', () => {
    let originalMatchMedia: typeof window.matchMedia;
    let originalRaf: typeof globalThis.requestAnimationFrame;
    let originalCancelRaf: typeof globalThis.cancelAnimationFrame;
    let rafSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        useGrind().reset();
        originalMatchMedia = window.matchMedia;
        originalRaf = globalThis.requestAnimationFrame;
        originalCancelRaf = globalThis.cancelAnimationFrame;
        // RAF that never actually invokes the callback — we only count
        // scheduling. Returning a positive handle keeps the gate's
        // `rafHandle === null` bookkeeping honest.
        let handle = 0;
        rafSpy = vi.fn<(cb: FrameRequestCallback) => number>(() => ++handle);
        globalThis.requestAnimationFrame = rafSpy as unknown as typeof globalThis.requestAnimationFrame;
        globalThis.cancelAnimationFrame = vi.fn<(handle: number) => void>();
    });

    afterEach(() => {
        window.matchMedia = originalMatchMedia;
        globalThis.requestAnimationFrame = originalRaf;
        globalThis.cancelAnimationFrame = originalCancelRaf;
    });

    it('schedules the RAF loop on mount when reduced motion is NOT preferred', () => {
        installMatchMedia(false);
        mount(GrindRenderer);
        // onMounted draws once and schedules the loop.
        expect(rafSpy).toHaveBeenCalledTimes(1);
    });

    it('does NOT schedule the RAF loop on mount when reduced motion IS preferred', () => {
        installMatchMedia(true);
        mount(GrindRenderer);
        // The static frame is painted synchronously in onMounted; no RAF.
        expect(rafSpy).not.toHaveBeenCalled();
    });

    it('subscribes to the matchMedia change event on mount', () => {
        const mq = installMatchMedia(false);
        mount(GrindRenderer);
        expect(mq.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    });

    it('restarts the loop when motion is re-enabled mid-flight', () => {
        const mq = installMatchMedia(true);
        mount(GrindRenderer);
        expect(rafSpy).not.toHaveBeenCalled();
        // OS toggles reduced motion OFF — the gate should re-arm the loop.
        mq.fire(false);
        expect(rafSpy).toHaveBeenCalledTimes(1);
    });

    it('freezes the loop when motion is disabled mid-flight', () => {
        const mq = installMatchMedia(false);
        mount(GrindRenderer);
        expect(rafSpy).toHaveBeenCalledTimes(1);
        rafSpy.mockClear();
        // OS toggles reduced motion ON — the gate cancels and does not re-arm.
        mq.fire(true);
        expect(rafSpy).not.toHaveBeenCalled();
        expect(globalThis.cancelAnimationFrame).toHaveBeenCalled();
    });

    it('detaches the matchMedia change listener on unmount', () => {
        const mq = installMatchMedia(false);
        const wrapper = mount(GrindRenderer);
        wrapper.unmount();
        expect(mq.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    });

    it('keeps the canvas frozen via resumeRaf under reduced motion', () => {
        installMatchMedia(true);
        const wrapper = mount(GrindRenderer);
        rafSpy.mockClear();
        // The panel host calls pauseRaf() then resumeRaf() on open/close.
        const renderer = wrapper.vm as unknown as {pauseRaf(): void; resumeRaf(): void};
        renderer.pauseRaf();
        renderer.resumeRaf();
        // Under reduced motion, resumeRaf paints a static frame but must not
        // re-arm the RAF loop.
        expect(rafSpy).not.toHaveBeenCalled();
    });
});
