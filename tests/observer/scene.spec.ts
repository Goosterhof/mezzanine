// The Long Bench renderer (#00041 §5), driven for real.
//
// jsdom has no Canvas 2D, so the canvas IS the mock: a recording context
// that no-ops every drawing call and keeps every `fillText` with the ink and
// alpha it was written in. The RAF is stubbed so each spec steps frames by
// hand at 60 fps. Nothing here reads a variable the scene set for itself
// when a drawn or DOM-visible result can be read instead.

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import type {ActivityState} from '../../src/observer/types';

import {INK, PENCIL, RED} from '../../src/observer/pen';
import {benchGeometry, benchStationX} from '../../src/observer/projection';

interface Written {
    text: string;
    fill: string;
    alpha: number;
}

interface SceneEntry {
    id: string;
    colleague: 'mad-scientist' | 'heretic' | null;
    activity: ActivityState;
    detail: string;
    target: string;
    mission: string;
    startedAtMs: number | null;
    idleWarn: boolean;
    crashed: boolean;
}

interface SceneController {
    setRoster: (entries: SceneEntry[]) => void;
    setSelected: (id: string | null) => void;
    setStrip: (on: boolean) => void;
    setTube: (labels: Record<string, string>) => void;
    setVacant: (list: {colleague: string; label: string}[]) => void;
    deliver: (receiver: 'mad-scientist' | 'heretic') => string;
    resize: (width: number) => void;
    getStationPos: (id: string) => {x: number; y: number} | null;
    getFloorSize: () => {w: number; h: number};
    pauseRaf: () => void;
    resumeRaf: () => void;
    destroy: () => void;
}

const W = 1440;
const MAD = 'claude-bench';
const HERETIC = 'codex-bench';

function entry(colleague: 'mad-scientist' | 'heretic', activity: ActivityState, extra: Partial<SceneEntry> = {}) {
    return {
        id: colleague === 'mad-scientist' ? MAD : HERETIC,
        colleague,
        activity,
        detail: '...',
        target: colleague === 'mad-scientist' ? 'The Mad Scientist' : 'The Heretic',
        mission: '',
        startedAtMs: Date.now() - 134_000,
        idleWarn: false,
        crashed: false,
        ...extra,
    };
}

function recordingCanvas() {
    const written: Written[] = [];
    const listeners = new Map<string, (event: MouseEvent) => void>();
    const state = {fillStyle: '', globalAlpha: 1, font: '', textAlign: 'start'};
    const methods: Record<string, unknown> = {
        fillText: (text: string) => written.push({text, fill: state.fillStyle, alpha: state.globalAlpha}),
        measureText: (text: string) => ({width: text.length * 7}),
    };
    const ctx = new Proxy(state, {
        get: (target, key: string) =>
            key in target ? target[key as keyof typeof target] : (methods[key] ?? (() => {})),
        set: (target, key: string, value: unknown) => {
            (target as Record<string, unknown>)[key] = value;
            return true;
        },
    });
    const canvas = {
        width: 0,
        height: 0,
        style: {} as Record<string, string>,
        dataset: {} as Record<string, string>,
        parentElement: {clientWidth: W},
        getContext: () => ctx,
        addEventListener: (type: string, fn: (event: MouseEvent) => void) => listeners.set(type, fn),
        removeEventListener: (type: string) => listeners.delete(type),
        getBoundingClientRect: () => ({left: 0, top: 0, width: W, height: canvas.height || 200}),
    };
    return {canvas, written, listeners};
}

let frames: FrameRequestCallback[] = [];
let now = 0;

function step(n = 1): void {
    for (let i = 0; i < n; i++) {
        const pending = frames;
        frames = [];
        now += 1000 / 60;
        for (const cb of pending) cb(now);
    }
}

async function boot(opts: {onInteraction?: (msg: {action?: string}) => void; onPlaced?: () => void} = {}) {
    const mod = (await import('../../src/observer/scene.js')) as unknown as {
        initScene: (o: {canvas: unknown; onInteraction?: unknown; onPlaced?: unknown}) => SceneController;
    };
    const rec = recordingCanvas();
    const scene = mod.initScene({canvas: rec.canvas, ...opts});
    return {scene, ...rec};
}

describe('the Long Bench renderer', () => {
    beforeEach(() => {
        frames = [];
        now = 0;
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
        vi.stubGlobal('cancelAnimationFrame', () => {});
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('sizes the canvas to its container at full width — no letterbox (D1)', async () => {
        const {scene, canvas} = await boot();
        expect(canvas.style.width).toBe(`${W}px`);
        expect(canvas.style.height).toBe('200px');
        expect(scene.getFloorSize()).toStrictEqual({w: W, h: 200});
        scene.setStrip(true);
        expect(canvas.style.height).toBe('64px');
        scene.resize(1080);
        expect(scene.getFloorSize()).toStrictEqual({w: 1080, h: 64});
        scene.resize(0);
        expect(scene.getFloorSize().w).toBe(1080);
        scene.destroy();
    });

    it('seats exactly two figures, ever — a roster row with no colleague draws nothing (trip-wire 4)', async () => {
        const {scene} = await boot();
        scene.setRoster([
            entry('mad-scientist', 'writing'),
            {...entry('heretic', 'idle'), id: 'legacy', colleague: null},
        ]);
        expect(scene.getStationPos(MAD)).not.toBeNull();
        expect(scene.getStationPos('legacy')).toBeNull();
        scene.destroy();
    });

    it('writes the label strip: name · state · clock, and the tube’s own words under its bells', async () => {
        const {scene, written} = await boot();
        scene.setRoster([entry('mad-scientist', 'writing'), entry('heretic', 'thinking')]);
        scene.setTube({'mad-scientist': 'Tube listening', heretic: 'Tube listening · between turns'});
        step();
        const texts = written.map((w) => w.text);
        expect(texts).toContain('The Mad Scientist');
        expect(texts).toContain(' · writing · ');
        expect(texts).toContain('2m 14s');
        expect(texts).toContain('Tube listening');
        expect(texts).toContain('Tube listening · between turns');
        scene.destroy();
    });

    it('never writes a letter in PENCIL, and keeps every INK run at alpha ≥ 0.75 (trip-wire 7, §2.4)', async () => {
        const {scene, written} = await boot();
        scene.setRoster([entry('mad-scientist', 'error', {crashed: true}), entry('heretic', 'idle', {idleWarn: true})]);
        scene.setSelected(HERETIC);
        scene.setTube({'mad-scientist': 'Tube offline', heretic: 'Tube listening'});
        step(3);
        expect(written.length).toBeGreaterThan(8);
        expect(written.filter((w) => w.fill === PENCIL)).toStrictEqual([]);
        // The two incidental marks — the footer and the stamped dimension —
        // are drawn into the paper / the margin and are not captions.
        const captions = written.filter((w) => !/^\d+$/.test(w.text));
        for (const w of captions) expect(w.alpha).toBeGreaterThanOrEqual(0.75);
        scene.destroy();
    });

    it('writes the crash voice in RED at full strength, with its [ recall ] always visible', async () => {
        const {scene, written} = await boot();
        scene.setRoster([entry('mad-scientist', 'error', {crashed: true}), entry('heretic', 'idle')]);
        step();
        const crash = written.find((w) => w.text.startsWith('Mission ended in failure. Recall to clear.'));
        expect(crash).toMatchObject({fill: RED, alpha: 1});
        expect(written.find((w) => w.text === '[ recall ]')).toMatchObject({fill: RED});
        scene.destroy();
    });

    it('writes the idle warning in INK, never in PENCIL', async () => {
        const {scene, written} = await boot();
        scene.setRoster([entry('mad-scientist', 'idle', {idleWarn: true})]);
        step();
        expect(written.find((w) => w.text === 'Idle 1h+')).toMatchObject({fill: INK});
        scene.destroy();
    });

    describe('the empty voice, re-voiced for the one path that reaches it (§12 #8)', () => {
        it('writes on the empty end when a bench failed to open', async () => {
            const {scene, written} = await boot();
            scene.setRoster([entry('mad-scientist', 'writing')]);
            scene.setVacant([{colleague: 'heretic', label: 'The Heretic'}]);
            step();
            const texts = written.map((w) => w.text);
            expect(texts).toContain('Balcony quiet.');
            expect(texts).toContain("The Heretic's bench did not open.");
            expect(texts).toContain('Retry from its nameplate above.');
            expect(texts).not.toContain('Balcony quiet. No scientists dispatched.');
            scene.destroy();
        });

        it('condenses to "Balcony quiet." on the crop', async () => {
            const {scene, written} = await boot();
            scene.setVacant([{colleague: 'mad-scientist', label: 'The Mad Scientist'}]);
            scene.setStrip(true);
            written.length = 0;
            step();
            const texts = written.map((w) => w.text);
            expect(texts).toContain('Balcony quiet.');
            expect(texts).not.toContain("The Mad Scientist's bench did not open.");
            scene.destroy();
        });

        it('says nothing on an end whose colleague is standing there', async () => {
            const {scene, written} = await boot();
            scene.setRoster([entry('heretic', 'idle')]);
            scene.setVacant([{colleague: 'heretic', label: 'The Heretic'}]);
            step();
            expect(written.map((w) => w.text)).not.toContain('Balcony quiet.');
            scene.destroy();
        });
    });

    describe('D4 — the plumb-line’s seam answers with the CURRENT position', () => {
        it('returns where the figure IS while it walks, not where it is going', async () => {
            const {scene} = await boot();
            scene.setRoster([entry('mad-scientist', 'writing')]);
            const start = scene.getStationPos(MAD)?.x ?? 0;
            scene.setRoster([entry('mad-scientist', 'waiting')]);
            step(20);
            const mid = scene.getStationPos(MAD)?.x ?? 0;
            const target = benchStationX(W, 'mad-scientist', 'waiting');
            expect(mid).toBeLessThan(start);
            expect(mid).toBeGreaterThan(target);
            expect(scene.getStationPos(MAD)?.y).toBeCloseTo(benchGeometry(W, false).headTopY);
            scene.destroy();
        });

        it('reports placement while the selected figure walks, and falls silent when it stands', async () => {
            const onPlaced = vi.fn<() => void>();
            const {scene} = await boot({onPlaced});
            scene.setRoster([entry('mad-scientist', 'writing')]);
            scene.setSelected(MAD);
            step(5);
            onPlaced.mockClear();
            step(30);
            expect(onPlaced).not.toHaveBeenCalled();
            scene.setRoster([entry('mad-scientist', 'reading')]);
            step(10);
            expect(onPlaced.mock.calls.length).toBeGreaterThanOrEqual(9);
            scene.destroy();
        });
    });

    describe('the crossing and the two freezes (§5.5, §5.6)', () => {
        async function crossingScene() {
            const booted = await boot();
            booted.scene.setRoster([entry('mad-scientist', 'writing'), entry('heretic', 'thinking')]);
            step();
            return booted;
        }

        it('plays a live delivery through its phases on the canvas’s own phase mark', async () => {
            const {scene, canvas} = await crossingScene();
            expect(scene.deliver('heretic')).toBe('started');
            step();
            expect(canvas.dataset.benchPhase).toBe('flight');
            step(60);
            expect(canvas.dataset.benchPhase).toBe('fetch');
            step(60 * 4);
            expect(canvas.dataset.benchPhase).toBe('read');
            expect(scene.getStationPos(HERETIC)?.x).toBe(benchGeometry(W, false).atBell.heretic);
            scene.destroy();
        });

        it('lands a delivery that arrives while the page is away — never replayed on return (§2.7)', async () => {
            const {scene, canvas} = await crossingScene();
            scene.pauseRaf();
            scene.deliver('heretic');
            expect(canvas.dataset.benchPhase).toBe('read');
            expect(scene.getStationPos(HERETIC)?.x).toBe(benchGeometry(W, false).atBell.heretic);
            scene.resumeRaf();
            step();
            expect(canvas.dataset.benchPhase).toBe('read');
            scene.destroy();
        });

        it('lands a capsule that is in the pipe when the page leaves — nothing frozen in transit', async () => {
            const {scene, canvas} = await crossingScene();
            scene.deliver('heretic');
            step(10);
            expect(canvas.dataset.benchPhase).toBe('flight');
            scene.pauseRaf();
            expect(canvas.dataset.benchPhase).toBe('read');
            scene.destroy();
        });

        it('holds a colleague caught mid-crossing exactly where they stand, and resumes the walk', async () => {
            const {scene, canvas} = await crossingScene();
            scene.deliver('heretic');
            step(80);
            expect(canvas.dataset.benchPhase).toBe('fetch');
            const held = scene.getStationPos(HERETIC)?.x ?? 0;
            scene.pauseRaf();
            step(120);
            expect(scene.getStationPos(HERETIC)?.x).toBe(held);
            expect(canvas.dataset.benchPhase).toBe('fetch');
            scene.resumeRaf();
            step(3);
            expect(scene.getStationPos(HERETIC)?.x).toBeLessThan(held);
            expect(canvas.dataset.benchPhase).toBe('fetch');
            scene.destroy();
        });

        it('keeps the crossing when the page re-cuts to the crop mid-walk', async () => {
            const {scene, canvas} = await crossingScene();
            scene.deliver('heretic');
            step(80);
            const fraction = (scene.getStationPos(HERETIC)?.x ?? 0) / W;
            scene.setStrip(true);
            expect((scene.getStationPos(HERETIC)?.x ?? 0) / W).toBeCloseTo(fraction, 9);
            expect(canvas.dataset.benchPhase).toBe('fetch');
            scene.destroy();
        });
    });

    describe('the page’s own hit regions', () => {
        it('selects a colleague by their figure and recalls by the [ recall ] note', async () => {
            const onInteraction = vi.fn<(msg: {action?: string}) => void>();
            const {scene, listeners} = await boot({onInteraction});
            scene.setRoster([entry('mad-scientist', 'writing'), entry('heretic', 'idle')]);
            scene.setSelected(MAD);
            step();
            const click = listeners.get('click');
            const geo = benchGeometry(W, false);
            click?.({clientX: benchStationX(W, 'heretic', 'idle'), clientY: geo.groundY - 70} as MouseEvent);
            expect(onInteraction).toHaveBeenLastCalledWith({type: 'interaction', action: `selectScientist:${HERETIC}`});
            // `[ recall ]` sits on line two, 13 px in from the Mad Scientist's anchor.
            click?.({clientX: 26 + 13 + 10, clientY: geo.benchTopY + 32} as MouseEvent);
            expect(onInteraction).toHaveBeenLastCalledWith({type: 'interaction', action: `recallScientist:${MAD}`});
            // The caption itself selects.
            click?.({clientX: 60, clientY: geo.benchTopY + 18} as MouseEvent);
            expect(onInteraction).toHaveBeenLastCalledWith({type: 'interaction', action: `selectScientist:${MAD}`});
            onInteraction.mockClear();
            click?.({clientX: W / 2, clientY: 20} as MouseEvent);
            expect(onInteraction).not.toHaveBeenCalled();
            scene.destroy();
        });
    });
});
