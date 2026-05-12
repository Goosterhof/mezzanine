import {invoke} from '@tauri-apps/api/core';
import {mount} from '@vue/test-utils';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {nextTick} from 'vue';

import type {BriefingTemplate} from '../../src/balcony/types';

import Dispatch from '../../src/balcony/Dispatch.vue';
import {useBriefingLibrary} from '../../src/balcony/useBriefingLibrary';
import {useDispatch} from '../../src/balcony/useDispatch';
import {useRoster} from '../../src/roster/useRoster';

const mockedInvoke = vi.mocked(invoke);

const TEMPLATES: BriefingTemplate[] = [
    {
        id: 'mission-control-sweep',
        label: 'Mission Control sweep',
        description: 'Sweep findings, signals, wounds.',
        targetShape: 'lab-wide',
        openingPrompt: 'Run a Mission Control sweep across the laboratory.',
    },
];

describe('Dispatch — Phase 2B', () => {
    beforeEach(async () => {
        useDispatch().reset();
        useBriefingLibrary().reset();
        useRoster().reset();
        mockedInvoke.mockReset();
        mockedInvoke.mockImplementation((cmd: string) => {
            if (cmd === 'list_briefing_templates') {
                return Promise.resolve(TEMPLATES);
            }
            return Promise.resolve(undefined);
        });
        await useBriefingLibrary().load();
    });

    it('does NOT render the sheet when dispatch is closed', () => {
        const wrapper = mount(Dispatch);
        expect(wrapper.find('[data-dispatch-sheet]').exists()).toBe(false);
    });

    it('renders the sheet header and brief textarea when dispatch is open', async () => {
        const d = useDispatch();
        d.show();
        const wrapper = mount(Dispatch);
        await nextTick();
        expect(wrapper.find('[data-dispatch-sheet]').exists()).toBe(true);
        expect(wrapper.text()).toContain('Send a scientist to the lab floor');
        expect(wrapper.find('[data-dispatch-brief]').exists()).toBe(true);
    });

    it('clicking close hides the dispatch sheet', async () => {
        const d = useDispatch();
        d.show();
        const wrapper = mount(Dispatch);
        await nextTick();
        const closeButton = wrapper.get('[data-dispatch-close]');
        await closeButton.trigger('click');
        expect(d.open.value).toBe(false);
    });

    it('clicking Cancel hides the dispatch sheet', async () => {
        const d = useDispatch();
        d.show();
        const wrapper = mount(Dispatch);
        await nextTick();
        const cancelButton = wrapper.get('[data-dispatch-cancel]');
        await cancelButton.trigger('click');
        expect(d.open.value).toBe(false);
    });

    it('typing in the brief textarea routes through setBrief and unbinds any template', async () => {
        const d = useDispatch();
        d.show();
        d.selectTemplate('mission-control-sweep');
        expect(d.templateId.value).toBe('mission-control-sweep');
        const wrapper = mount(Dispatch);
        await nextTick();
        const ta = wrapper.get('[data-dispatch-brief]');
        await ta.setValue('I typed this myself');
        expect(d.brief.value).toBe('I typed this myself');
        expect(d.templateId.value).toBeNull();
    });

    it('submit button is disabled until a target and brief are set', async () => {
        const d = useDispatch();
        d.show();
        const wrapper = mount(Dispatch);
        await nextTick();
        const submitButton = wrapper.get('[data-dispatch-submit]');
        expect(submitButton.attributes('disabled')).toBeDefined();
        d.setTarget({kind: 'experiment', codename: 'crucible'});
        d.setBrief('check phpstan');
        await nextTick();
        expect(wrapper.get('[data-dispatch-submit]').attributes('disabled')).toBeUndefined();
    });

    it('escape on the sheet hides the dispatch', async () => {
        const d = useDispatch();
        d.show();
        const wrapper = mount(Dispatch);
        await nextTick();
        const sheet = wrapper.get('[data-dispatch-sheet]');
        await sheet.trigger('keydown', {key: 'Escape'});
        expect(d.open.value).toBe(false);
    });

    it('ctrl+enter on the sheet submits when the form is valid', async () => {
        const d = useDispatch();
        d.show();
        d.setTarget({kind: 'experiment', codename: 'crucible'});
        d.setBrief('check phpstan');
        mockedInvoke.mockImplementation((cmd: string) => {
            if (cmd === 'list_briefing_templates') return Promise.resolve(TEMPLATES);
            if (cmd === 'dispatch_scientist') {
                return Promise.resolve({
                    id: '11111111-1111-4111-8111-111111111111',
                    target: {kind: 'experiment', codename: 'crucible'},
                    mission: 'check phpstan',
                    state: 'working',
                    startedAt: '2026-05-12T10:00:00Z',
                    lastStateChange: '2026-05-12T10:00:00Z',
                });
            }
            return Promise.resolve(undefined);
        });
        const wrapper = mount(Dispatch);
        await nextTick();
        const sheet = wrapper.get('[data-dispatch-sheet]');
        await sheet.trigger('keydown', {key: 'Enter', ctrlKey: true});
        await Promise.resolve();
        await Promise.resolve();
        const calls = mockedInvoke.mock.calls.map((c) => c[0]);
        expect(calls).toContain('dispatch_scientist');
    });

    it('renders the error banner when lastError is set', async () => {
        const d = useDispatch();
        d.show();
        d.lastError.value = 'Backend refused the dispatch.';
        const wrapper = mount(Dispatch);
        await nextTick();
        const banner = wrapper.get('[data-dispatch-error]');
        expect(banner.text()).toContain('Backend refused the dispatch.');
    });
});
