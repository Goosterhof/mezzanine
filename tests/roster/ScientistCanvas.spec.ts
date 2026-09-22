import {invoke} from '@tauri-apps/api/core';
import {flushPromises, mount} from '@vue/test-utils';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {nextTick} from 'vue';

import type {Colleague, Scientist} from '../../src/roster/types';

import ScientistCanvas from '../../src/roster/ScientistCanvas.vue';
import {useIdleWarning} from '../../src/roster/useIdleWarning';
import {useRoster} from '../../src/roster/useRoster';
import {useRosterBackend} from '../../src/roster/useRosterBackend';
import {useScientistTerminals} from '../../src/roster/useScientistTerminals';

function scientist(id: string, colleague: Colleague): Scientist {
    return {
        id,
        colleague,
        target: {kind: 'lab-root'},
        mission: '',
        state: 'working',
        startedAt: '2026-09-16T18:00:00Z',
        lastStateChange: '2026-09-16T18:00:00Z',
    };
}
const settle = async () => {
    await nextTick();
    await nextTick();
};

describe('ScientistCanvas — both colleagues visible', () => {
    let wrapper: ReturnType<typeof mount<typeof ScientistCanvas>>;
    beforeEach(() => {
        useRoster().reset();
        useIdleWarning()._resetForTests();
        useScientistTerminals().reset();
        useRosterBackend()._resetSubscriptionForTests();
        vi.mocked(invoke).mockReset().mockResolvedValue(undefined);
    });
    afterEach(() => {
        wrapper.unmount();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });
    function open() {
        wrapper = mount(ScientistCanvas, {attachTo: document.body});
        return wrapper;
    }
    function both() {
        useRoster().upsert(scientist('claude', 'mad-scientist'));
        useRoster().upsert(scientist('codex', 'heretic'));
        useRoster().select('claude');
    }

    it('reserves a named pane for each colleague before either starts', () => {
        open();
        expect(wrapper.findAll('[data-terminal-pane]').map((p) => p.attributes('data-terminal-pane'))).toStrictEqual([
            'mad-scientist',
            'heretic',
        ]);
        expect(wrapper.findAll('button').every((b) => b.attributes('disabled') !== undefined)).toBe(true);
    });
    it('opens both terminals immediately, including the unselected colleague', async () => {
        both();
        open();
        await settle();
        for (const id of ['claude', 'codex']) {
            const terminal = useScientistTerminals().get(id).terminal;
            expect(terminal.element?.parentElement).toBe(wrapper.get(`[data-terminal="${id}"]`).element);
        }
    });
    it('keeps the scientist left and Heretic right when they arrive in reverse order', async () => {
        useRoster().upsert(scientist('codex', 'heretic'));
        open();
        await settle();
        useRoster().upsert(scientist('claude', 'mad-scientist'));
        await settle();
        expect(wrapper.findAll('[data-terminal]').map((p) => p.attributes('data-terminal'))).toStrictEqual([
            'claude',
            'codex',
        ]);
    });
    it('selects the clicked pane for the shared command input', async () => {
        both();
        open();
        await settle();
        await wrapper.get('[data-terminal-pane="heretic"]').trigger('pointerdown');
        expect(useRoster().selected.value).toBe('codex');
        expect(wrapper.get('[data-terminal-pane="heretic"] button').text()).toContain('Typing here');
    });
    it('selects a terminal reached through keyboard focus', async () => {
        both();
        open();
        await settle();
        await wrapper.get('[data-terminal-pane="heretic"]').trigger('focusin');
        expect(useRoster().selected.value).toBe('codex');
    });
    it('keeps both terminal elements and scrollback when selection changes', async () => {
        both();
        open();
        await settle();
        const elements = ['claude', 'codex'].map((id) => useScientistTerminals().get(id).terminal.element);
        useRoster().select('codex');
        await settle();
        useRoster().select(null);
        await settle();
        expect(['claude', 'codex'].map((id) => useScientistTerminals().get(id).terminal.element)).toStrictEqual(
            elements,
        );
        expect(wrapper.findAll('[data-terminal]')).toHaveLength(2);
        for (const pane of wrapper.findAll('[data-terminal]')) {
            expect((pane.element as HTMLElement).style.visibility).not.toBe('hidden');
        }
    });
    it('re-fits both PTYs when the shared canvas resizes', async () => {
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({width: 600, height: 400} as DOMRect);
        let resize: () => void = vi.fn<() => void>();
        vi.stubGlobal(
            'ResizeObserver',
            class {
                constructor(callback: () => void) {
                    resize = callback;
                }
                observe() {}
                disconnect() {}
            },
        );
        both();
        open();
        await settle();
        const spies = ['claude', 'codex'].map((id) => vi.spyOn(useScientistTerminals().get(id).fit, 'fit'));
        resize();
        for (const spy of spies) expect(spy).toHaveBeenCalled();
    });
    it('does not fit hidden terminals, and refits their existing elements on return', async () => {
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({width: 600, height: 400} as DOMRect);
        both();
        open();
        await settle();
        const slots = ['claude', 'codex'].map((id) => useScientistTerminals().get(id));
        const elements = slots.map((slot) => slot.terminal.element);
        const fits = slots.map((slot) => vi.spyOn(slot.fit, 'fit'));
        await wrapper.setProps({active: false});
        await settle();
        for (const fit of fits) expect(fit).not.toHaveBeenCalled();
        await wrapper.setProps({active: true});
        await settle();
        for (const fit of fits) expect(fit).toHaveBeenCalledOnce();
        expect(slots.map((slot) => slot.terminal.element)).toStrictEqual(elements);
    });
    it('skips zero-size fits even when the page is active (minimized window)', async () => {
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({width: 0, height: 0} as DOMRect);
        both();
        const fits = ['claude', 'codex'].map((id) => vi.spyOn(useScientistTerminals().get(id).fit, 'fit'));
        open();
        await settle();
        for (const fit of fits) expect(fit).not.toHaveBeenCalled();
        expect(vi.mocked(invoke).mock.calls.some(([cmd]) => cmd === 'resize_scientist')).toBe(false);
    });
    it('replaces a restarted bench without detaching the other terminal', async () => {
        both();
        open();
        await settle();
        const left = useScientistTerminals().get('claude').terminal.element;
        useRoster().remove('codex');
        useRoster().upsert(scientist('codex-new', 'heretic'));
        await settle();
        expect(wrapper.find('[data-terminal="codex"]').exists()).toBe(false);
        expect(useScientistTerminals().get('codex-new').terminal.element?.parentElement).toBe(
            wrapper.get('[data-terminal="codex-new"]').element,
        );
        expect(useScientistTerminals().get('claude').terminal.element).toBe(left);
    });

    // ---- The terminal face must be loaded before a terminal measures -------
    // Opening on the fallback face measured a ~7.83x18 cell; the real 8x20 face
    // then drew the fitted rows past the pane's bottom edge (2026-09-22).
    describe('waits for the terminal face before measuring', () => {
        afterEach(() => {
            Reflect.deleteProperty(document, 'fonts');
            vi.useRealTimers();
        });
        function stubFonts(loaded: boolean, load: () => Promise<unknown>) {
            const fonts = {
                check: vi.fn<(face: string) => boolean>(() => loaded),
                load: vi.fn<(face: string) => Promise<unknown>>(load),
            };
            Object.defineProperty(document, 'fonts', {configurable: true, value: fonts});
            return fonts;
        }
        it('does not open a terminal until JetBrains Mono has loaded', async () => {
            const waiting: Array<() => void> = [];
            const finish = () => {
                for (const resolve of waiting.splice(0)) resolve();
            };
            const fonts = stubFonts(false, () => new Promise<void>((resolve) => waiting.push(resolve)));
            both();
            open();
            await settle();
            expect(fonts.load).toHaveBeenCalledWith('13px "JetBrains Mono"');
            expect(useScientistTerminals().get('claude').terminal.element).toBeUndefined();
            finish();
            await flushPromises();
            await settle();
            expect(useScientistTerminals().get('claude').terminal.element?.parentElement).toBe(
                wrapper.get('[data-terminal="claude"]').element,
            );
        });
        it('opens at once when the face is already loaded', async () => {
            const fonts = stubFonts(true, () => Promise.resolve());
            both();
            open();
            await settle();
            expect(fonts.load).not.toHaveBeenCalled();
            expect(useScientistTerminals().get('claude').terminal.element).toBeDefined();
        });
        it('opens on the fallback after the wait, then re-measures and refits when the face lands', async () => {
            vi.useFakeTimers({toFake: ['setTimeout']});
            vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
                width: 640,
                height: 480,
            } as DOMRect);
            const waiting: Array<() => void> = [];
            const finish = () => {
                for (const resolve of waiting.splice(0)) resolve();
            };
            stubFonts(false, () => new Promise<void>((resolve) => waiting.push(resolve)));
            both();
            open();
            await settle();
            expect(useScientistTerminals().get('claude').terminal.element).toBeUndefined();
            await vi.advanceTimersByTimeAsync(3000);
            await settle();
            const slot = useScientistTerminals().get('claude');
            expect(slot.terminal.element).toBeDefined();
            const before = slot.terminal.options.fontFamily;
            const fit = vi.spyOn(slot.fit, 'fit');
            finish();
            await flushPromises();
            await settle();
            expect(slot.terminal.options.fontFamily).not.toBe(before);
            expect(slot.terminal.options.fontFamily?.trim()).toBe(before?.trim());
            expect(fit).toHaveBeenCalled();
        });
        it('abandons the mount if the canvas unmounts while the face loads', async () => {
            const waiting: Array<() => void> = [];
            const finish = () => {
                for (const resolve of waiting.splice(0)) resolve();
            };
            stubFonts(false, () => new Promise<void>((resolve) => waiting.push(resolve)));
            both();
            open();
            await settle();
            wrapper.unmount();
            finish();
            await flushPromises();
            await settle();
            expect(useScientistTerminals().get('claude').terminal.element).toBeUndefined();
            wrapper = mount(ScientistCanvas, {attachTo: document.body});
        });
    });
});
