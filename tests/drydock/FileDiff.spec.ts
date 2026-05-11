import {mount} from '@vue/test-utils';
import {describe, expect, it} from 'vitest';

import type {DrydockPrFile, FileEnrichment} from '../../src/drydock/types';

import FileDiff from '../../src/drydock/FileDiff.vue';

const FILE: DrydockPrFile = {path: 'src/x/Y.vue', additions: 3, deletions: 1};

describe('FileDiff', () => {
    it('renders the file path and add/del counts', () => {
        const wrapper = mount(FileDiff, {props: {file: FILE, enrichment: undefined}});
        expect(wrapper.text()).toContain('src/x/Y.vue');
        expect(wrapper.text()).toContain('+3');
        expect(wrapper.text()).toContain('−1');
        wrapper.unmount();
    });

    it('renders the loading stamp while enrichment loads', () => {
        const enrichment: FileEnrichment = {
            minionTouch: null,
            chaosDetonations: [],
            activeLog: null,
            loading: true,
            error: null,
        };
        const wrapper = mount(FileDiff, {props: {file: FILE, enrichment}});
        expect(wrapper.text()).toContain('Reading lab memory');
        wrapper.unmount();
    });

    it('renders the three fields when enrichment is present', () => {
        const enrichment: FileEnrichment = {
            minionTouch: {
                minion: 'The Task Master',
                commitHash: 'deadbee1234',
                author: 'gerard',
                date: '2026-04-15',
                subject: 'feat(crucible): pane [DELIVERED]',
            },
            chaosDetonations: [
                {
                    reportNumber: '00045',
                    reportFilename: '00045-chaos.md',
                    title: '#00045',
                    madnessScore: 9,
                    madnessLabel: 'Inferno',
                },
            ],
            activeLog: {
                number: '00047',
                filename: '00047.md',
                title: 'The Crucible Calendar',
                status: 'IN PROGRESS',
                scope: 'crucible',
            },
            loading: false,
            error: null,
        };
        const wrapper = mount(FileDiff, {props: {file: FILE, enrichment}});
        expect(wrapper.text()).toContain('The Task Master');
        expect(wrapper.text()).toContain('2026-04-15');
        expect(wrapper.text()).toContain('deadbee');
        expect(wrapper.text()).toContain('#00045');
        expect(wrapper.text()).toContain('9/10');
        expect(wrapper.text()).toContain('Inferno');
        expect(wrapper.text()).toContain('The Crucible Calendar');
        expect(wrapper.text()).toContain('IN PROGRESS');
        wrapper.unmount();
    });

    it('renders all three empty-state strings when enrichment is empty', () => {
        const enrichment: FileEnrichment = {
            minionTouch: null,
            chaosDetonations: [],
            activeLog: null,
            loading: false,
            error: null,
        };
        const wrapper = mount(FileDiff, {props: {file: FILE, enrichment}});
        expect(wrapper.text()).toContain('No minion-stamped commits found for this file');
        expect(wrapper.text()).toContain('No chaos detonations on record');
        expect(wrapper.text()).toContain('No active experiment log');
        wrapper.unmount();
    });

    it('renders the enrichment-error stamp when the read failed', () => {
        const enrichment: FileEnrichment = {
            minionTouch: null,
            chaosDetonations: [],
            activeLog: null,
            loading: false,
            error: 'gh exploded',
        };
        const wrapper = mount(FileDiff, {props: {file: FILE, enrichment}});
        const err = wrapper.find('[data-test="enrichment-error"]');
        expect(err.exists()).toBe(true);
        expect(err.text()).toContain('gh exploded');
        wrapper.unmount();
    });
});
