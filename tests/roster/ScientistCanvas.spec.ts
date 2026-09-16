import {invoke} from '@tauri-apps/api/core';
import {mount} from '@vue/test-utils';
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
});
