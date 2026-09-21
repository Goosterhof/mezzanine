import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {flushPromises, mount} from '@vue/test-utils';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import type {Scientist} from '../../src/roster/types';

import App from '../../src/App.vue';
import {EMPTY_BALCONY_SIGNS} from '../../src/balcony/types';
import {useGrind} from '../../src/grind/useGrind';
import {useObserver} from '../../src/observer/useObserver';
import {useRoster} from '../../src/roster/useRoster';
import {useRosterBackend} from '../../src/roster/useRosterBackend';
import {useScientistTerminals} from '../../src/roster/useScientistTerminals';
import {PAGES, useShell} from '../../src/shell/useShell';
import {useWizard} from '../../src/wizard/useWizard';

const scientists: Scientist[] = ['mad-scientist', 'heretic'].map((id) => ({
    id,
    colleague: id as Scientist['colleague'],
    target: {kind: 'lab-root'},
    state: 'idle',
    mission: '',
    startedAt: '',
    lastStateChange: '',
}));

describe('navigation preserves both live conversations', () => {
    let wrapper: ReturnType<typeof mount<typeof App>>;
    beforeEach(() => {
        useShell().reset();
        useWizard().reset();
        useRoster().reset();
        useScientistTerminals().reset();
        useRosterBackend()._resetSubscriptionForTests();
        vi.mocked(listen).mockClear();
        vi.mocked(invoke).mockImplementation((command) => {
            switch (command) {
                case 'list_roster':
                    return Promise.resolve(scientists);
                case 'list_recently_recalled':
                case 'list_briefing_templates':
                    return Promise.resolve([]);
                case 'read_balcony_signs':
                    return Promise.resolve(EMPTY_BALCONY_SIGNS);
                case 'read_wizard_state':
                    return Promise.resolve({completedAt: null, labRoot: '/lab', claudeBinary: 'claude'});
                case 'read_wizard_detected':
                    return Promise.resolve({labRoot: '/lab', claudeBinary: 'claude', hostPlatform: 'unix'});
                default:
                    return Promise.resolve(null);
            }
        });
    });
    afterEach(() => {
        wrapper.unmount();
        useGrind().reset();
        useObserver().reset();
        useScientistTerminals().reset();
        useRosterBackend()._resetSubscriptionForTests();
    });

    it('keeps the actual xterm elements, receives background output and retains the draft across every page', async () => {
        wrapper = mount(App, {
            attachTo: document.body,
            global: {
                stubs: {
                    LabFloor: true,
                    ColleagueBenches: true,
                    FirstRunWizard: true,
                    AscentPrompt: true,
                    MissionControl: true,
                    DrydockPanel: true,
                    HolotablePanel: true,
                    GrindPanel: true,
                    Dispatch: true,
                },
            },
        });
        await flushPromises();
        const terminals = scientists.map((s) => useScientistTerminals().get(s.id).terminal);
        const elements = terminals.map((t) => t.element);
        const draft = wrapper.get('[data-command-input]');
        await draft.setValue('An unfinished thought');
        const output = vi.mocked(listen).mock.calls.find(([name]) => name === 'scientist-output')?.[1];
        expect(output).toBeDefined();

        for (const page of PAGES.filter((p) => p.id !== 'conversation')) {
            await wrapper.get(`[data-page-link="${page.id}"]`).trigger('click');
            expect(wrapper.get('[data-page="conversation"]').isVisible()).toBe(false);
            for (const scientist of scientists) {
                output?.({
                    event: 'scientist-output',
                    id: 1,
                    payload: {scientist: scientist.id, chunk: `Answer while on ${page.id}\r\n`},
                });
            }
            await Promise.all(terminals.map((t) => new Promise<void>((resolve) => t.write('', resolve))));
        }
        await wrapper.get('[data-page-link="conversation"]').trigger('click');
        await flushPromises();
        expect(wrapper.get('[data-page="conversation"]').isVisible()).toBe(true);
        expect(terminals.map((t) => t.element)).toStrictEqual(elements);
        expect((draft.element as HTMLInputElement).value).toBe('An unfinished thought');
        for (const terminal of terminals) {
            const history = Array.from({length: terminal.buffer.active.length}, (_, i) =>
                terminal.buffer.active.getLine(i)?.translateToString(true),
            ).join('\n');
            for (const page of PAGES.filter((p) => p.id !== 'conversation'))
                expect(history).toContain(`Answer while on ${page.id}`);
        }
        expect(vi.mocked(invoke).mock.calls.some(([cmd]) => ['open_colleague', 'recall_scientist'].includes(cmd))).toBe(
            false,
        );
        expect(vi.mocked(listen).mock.calls.filter(([name]) => name === 'scientist-output')).toHaveLength(1);
    }, 15000);
});
