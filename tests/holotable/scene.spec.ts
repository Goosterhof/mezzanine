// Headless smoke test for the lifted WebGL engine (scene.js).
//
// scene.js is excluded from oxlint / vue-tsc / v8 coverage because it is a
// lifted hand-built WebGL engine and jsdom has no WebGL context — so nothing
// ever exercised its render loop. A scoping bug hid there for the whole lift:
// `drawBeams()` referenced `summonElapsed`, a `var` local to `render()`
// declared *after* drawBeams is called, which threw a ReferenceError every
// frame under strict mode and froze the floor on "Connecting nervous
// system…" over a black canvas.
//
// This test drives the engine with a no-op WebGL stub and a manual RAF pump,
// asserting the summon ceremony actually completes to "Online". It does not
// validate pixels — it validates that render() runs frame after frame without
// throwing and reaches its terminal state.

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {initScene} from '../../src/holotable/scene.js';

interface Display {
    textContent: string;
    style: Record<string, string>;
    getBoundingClientRect: () => {width: number; height: number; left: number; top: number};
}

function mkEl(): Display {
    return {textContent: '', style: {}, getBoundingClientRect: () => ({width: 800, height: 600, left: 0, top: 0})};
}

// A no-op WebGL context: any method is a function; the few calls whose return
// value scene.js branches on (shader/program compile checks, locations,
// resource creation) return truthy stubs so initialization does not bail.
function glStub(): unknown {
    return new Proxy(
        {},
        {
            get(_target, prop) {
                if (prop === 'getProgramParameter' || prop === 'getShaderParameter') return () => true;
                if (prop === 'getAttribLocation') return () => 0;
                if (prop === 'getUniformLocation') return () => ({});
                if (
                    prop === 'createBuffer' ||
                    prop === 'createShader' ||
                    prop === 'createProgram' ||
                    prop === 'createTexture'
                )
                    return () => ({});
                return () => 1;
            },
        },
    );
}

interface RafController {
    pump: (ms: number) => void;
}

let rafController: RafController;
let originalRaf: typeof globalThis.requestAnimationFrame;
let originalCancel: typeof globalThis.cancelAnimationFrame;

beforeEach(() => {
    originalRaf = globalThis.requestAnimationFrame;
    originalCancel = globalThis.cancelAnimationFrame;
    let queue: FrameRequestCallback[] = [];
    let now = 0;
    globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
        queue.push(cb);
        return queue.length;
    };
    globalThis.cancelAnimationFrame = () => {};
    rafController = {
        pump(ms: number) {
            now += ms;
            const due = queue;
            queue = [];
            for (const cb of due) cb(now);
        },
    };
});

afterEach(() => {
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCancel;
});

function buildScene() {
    const canvas = {
        getContext: () => glStub(),
        width: 800,
        height: 600,
        style: {} as Record<string, string>,
        addEventListener: () => {},
        removeEventListener: () => {},
        getBoundingClientRect: () => ({width: 800, height: 600, left: 0, top: 0}),
    };
    const statusDisplay = mkEl();
    const branchDisplay = mkEl();
    const controller = initScene({
        canvas,
        container: mkEl(),
        tooltip: mkEl(),
        infoPanel: mkEl(),
        branchDisplay,
        statusDisplay,
        fpsDisplay: mkEl(),
        lastUpdateDisplay: mkEl(),
        onInteraction: () => {},
    });
    return {controller, statusDisplay, branchDisplay};
}

const SAMPLE_STATE = {
    structures: [
        {id: 'tower', label: 'Zmuuzn', type: 'tower', health: 'green', detail: '', meta: {}},
        {id: 'exp-a', label: 'The Gatekeeper', type: 'experiment', health: 'red', detail: '', meta: {}},
        {id: 'exp-b', label: 'The War Table', type: 'experiment', health: 'green', detail: '', meta: {}},
        {id: 'database', label: 'PostgreSQL', type: 'database', health: 'green', detail: '', meta: {}},
        {id: 'pipeline', label: 'Railway', type: 'pipeline', health: 'green', detail: '', meta: {}},
    ],
    branch: 'main',
    branchHealth: 'green',
    timestamp: '2026-06-12T10:00:00Z',
};

describe('holotable scene engine', () => {
    it('initializes into a controller honouring the host contract', () => {
        const {controller} = buildScene();
        expect(controller).toBeTruthy();
        expect(typeof controller.setState).toBe('function');
        expect(typeof controller.pauseRaf).toBe('function');
        expect(typeof controller.resumeRaf).toBe('function');
        expect(typeof controller.destroy).toBe('function');
    });

    it('runs the summon ceremony to completion without throwing (regression: drawBeams summonElapsed)', () => {
        const {controller, statusDisplay, branchDisplay} = buildScene();
        controller.setState(SAMPLE_STATE);
        const phases: string[] = [];
        // ~6s of frames at 100ms — the ceremony is 3.5s.
        for (let i = 0; i < 60; i++) {
            rafController.pump(100);
            if (!phases.includes(statusDisplay.textContent)) phases.push(statusDisplay.textContent);
        }
        // The beam-draw path (which threw before the fix) is exercised during
        // the ceremony; reaching "Online" proves render() never aborted.
        expect(phases).toContain('Connecting nervous system...');
        expect(statusDisplay.textContent).toBe('Online');
        expect(branchDisplay.textContent).toBe('main');
    });

    it('settles back to Online after a second state push (refresh does not wedge)', () => {
        const {controller, statusDisplay} = buildScene();
        controller.setState(SAMPLE_STATE);
        for (let i = 0; i < 60; i++) rafController.pump(100);
        controller.setState({...SAMPLE_STATE, timestamp: '2026-06-12T10:05:00Z'});
        for (let i = 0; i < 60; i++) rafController.pump(100);
        expect(statusDisplay.textContent).toBe('Online');
    });
});

// --- Reduced-Motion Gate (WR-0090, WCAG 2.3.3 AAA) -------------------------
// The render loop must freeze when the OS prefers reduced motion. The gate
// reads window.matchMedia('(prefers-reduced-motion: reduce)') at initScene
// time; the global tests/setup.ts stubs matchMedia to a non-matching query,
// so these tests install a controllable stub that reports `matches: true`
// (and captures the `change` handler the gate subscribes to).

type RmChangeHandler = (e: MediaQueryListEvent) => void;

interface FakeReducedMotionQuery {
    matches: boolean;
    handlers: RmChangeHandler[];
    fire(matches: boolean): void;
    removed: boolean;
}

function installReducedMotion(initialMatches: boolean): FakeReducedMotionQuery {
    const mq: FakeReducedMotionQuery = {
        matches: initialMatches,
        handlers: [],
        removed: false,
        fire(matches: boolean): void {
            mq.matches = matches;
            for (const h of mq.handlers) h({matches} as MediaQueryListEvent);
        },
    };
    window.matchMedia = (query: string) =>
        ({
            matches: mq.matches,
            media: query,
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: (_type: string, handler: RmChangeHandler) => mq.handlers.push(handler),
            removeEventListener: (_type: string, handler: RmChangeHandler) => {
                mq.handlers = mq.handlers.filter((h) => h !== handler);
                mq.removed = true;
            },
            dispatchEvent: () => false,
        }) as unknown as MediaQueryList;
    return mq;
}

describe('holotable scene engine — reduced-motion gate', () => {
    let originalMatchMedia: typeof window.matchMedia;

    beforeEach(() => {
        originalMatchMedia = window.matchMedia;
    });

    afterEach(() => {
        window.matchMedia = originalMatchMedia;
    });

    it('freezes the render loop under reduced motion (one static frame, never reaches the animated ceremony)', () => {
        installReducedMotion(true);
        const {controller, statusDisplay} = buildScene();
        controller.setState(SAMPLE_STATE);
        // Pump well past the 3.5s ceremony. Under reduced motion the loop
        // paints one static frame and stops re-scheduling, so the multi-phase
        // animated ceremony ("Connecting nervous system...") never advances.
        const phases: string[] = [];
        for (let i = 0; i < 60; i++) {
            rafController.pump(100);
            if (!phases.includes(statusDisplay.textContent)) phases.push(statusDisplay.textContent);
        }
        expect(phases).not.toContain('Connecting nervous system...');
        expect(statusDisplay.textContent).not.toBe('Online');
    });

    it('restarts the loop when the OS re-enables motion mid-flight', () => {
        const mq = installReducedMotion(true);
        const {controller, statusDisplay} = buildScene();
        controller.setState(SAMPLE_STATE);
        for (let i = 0; i < 10; i++) rafController.pump(100);
        // Sanity: still frozen.
        expect(statusDisplay.textContent).not.toBe('Online');
        // OS toggles reduced motion OFF — the gate re-arms the loop.
        mq.fire(false);
        for (let i = 0; i < 60; i++) rafController.pump(100);
        expect(statusDisplay.textContent).toBe('Online');
    });

    it('runs normally when reduced motion is not preferred', () => {
        installReducedMotion(false);
        const {controller, statusDisplay} = buildScene();
        controller.setState(SAMPLE_STATE);
        for (let i = 0; i < 60; i++) rafController.pump(100);
        expect(statusDisplay.textContent).toBe('Online');
    });

    it('detaches the matchMedia change listener on destroy', () => {
        const mq = installReducedMotion(false);
        const {controller} = buildScene();
        controller.destroy();
        expect(mq.removed).toBe(true);
    });
});
