import {invoke} from '@tauri-apps/api/core';
import {mount} from '@vue/test-utils';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import type {BriefingTemplate} from '../../src/balcony/types';

import BriefingLibrary from '../../src/balcony/BriefingLibrary.vue';
import {useBriefingLibrary} from '../../src/balcony/useBriefingLibrary';

const mockedInvoke = vi.mocked(invoke);

const TEMPLATES: BriefingTemplate[] = [
    {
        id: 'mission-control-sweep',
        label: 'Mission Control sweep',
        description: 'Sweep findings, signals, wounds.',
        targetShape: 'lab-wide',
        openingPrompt: 'Run a Mission Control sweep.',
    },
    {
        id: 'experiment-dossier-read',
        label: 'Experiment dossier read',
        description: 'Read the selected dossier.',
        targetShape: 'per-experiment',
        openingPrompt: 'Read the dossier in full.',
    },
];

describe('BriefingLibrary', () => {
    beforeEach(async () => {
        useBriefingLibrary().reset();
        mockedInvoke.mockReset();
        mockedInvoke.mockResolvedValue(TEMPLATES);
        await useBriefingLibrary().load();
    });

    it('renders one card per template', () => {
        const wrapper = mount(BriefingLibrary, {props: {selectedId: null}});
        expect(wrapper.findAll('[data-briefing-template]')).toHaveLength(TEMPLATES.length);
    });

    it('marks the selected card with data-selected=true and the brass border', () => {
        const wrapper = mount(BriefingLibrary, {props: {selectedId: 'experiment-dossier-read'}});
        const selected = wrapper.find('[data-briefing-template="experiment-dossier-read"]');
        expect(selected.attributes('data-selected')).toBe('true');
        expect(selected.classes()).toContain('border-mz-brass');
        const other = wrapper.find('[data-briefing-template="mission-control-sweep"]');
        expect(other.attributes('data-selected')).toBe('false');
    });

    it('emits select with the id when an unselected card is clicked', async () => {
        const wrapper = mount(BriefingLibrary, {props: {selectedId: null}});
        await wrapper.find('[data-briefing-template="mission-control-sweep"]').trigger('click');
        expect(wrapper.emitted('select')?.[0]).toStrictEqual(['mission-control-sweep']);
    });

    it('emits select with null when the currently selected card is clicked again', async () => {
        const wrapper = mount(BriefingLibrary, {props: {selectedId: 'mission-control-sweep'}});
        await wrapper.find('[data-briefing-template="mission-control-sweep"]').trigger('click');
        expect(wrapper.emitted('select')?.[0]).toStrictEqual([null]);
    });

    it('renders the target-shape badge per card', () => {
        const wrapper = mount(BriefingLibrary, {props: {selectedId: null}});
        const labWide = wrapper.find('[data-briefing-template="mission-control-sweep"]');
        const perExperiment = wrapper.find('[data-briefing-template="experiment-dossier-read"]');
        expect(labWide.text()).toContain('Lab-Wide');
        expect(perExperiment.text()).toContain('Per Experiment');
    });
});
