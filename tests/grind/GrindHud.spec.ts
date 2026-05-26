import {mount} from '@vue/test-utils';
import {beforeEach, describe, expect, it} from 'vitest';
import {nextTick} from 'vue';

import GrindHud from '../../src/grind/GrindHud.vue';
import {useGrind} from '../../src/grind/useGrind';
import {useRoster} from '../../src/roster/useRoster';

describe('GrindHud', () => {
    beforeEach(() => {
        useGrind().reset();
        useRoster().reset();
    });

    it('renders the instrument panel with zero RP on a fresh state', () => {
        const wrapper = mount(GrindHud);
        expect(wrapper.text()).toContain('Research Points');
        expect(wrapper.text()).toContain('Output');
        expect(wrapper.text()).toContain('Dispatched');
    });

    it('uses Mezzanine vocabulary, not VS Code vocabulary', () => {
        const wrapper = mount(GrindHud);
        const grind = useGrind();
        grind._injectGrantForTests({source: 'chronicle-line', scientistId: 'sid', amount: 1});
        // Force re-render
        return nextTick().then(() => {
            expect(wrapper.text()).toContain('Chronicle Line');
            expect(wrapper.text()).not.toContain('Keystroke');
            expect(wrapper.text()).not.toContain('File Save');
        });
    });

    it('exposes four equipment tabs', () => {
        const wrapper = mount(GrindHud);
        const tabs = wrapper.findAll('[data-tab]');
        const ids = tabs.map((t) => t.attributes('data-tab'));
        expect(ids).toStrictEqual(['workbench', 'research', 'dossier', 'feats']);
    });

    it('renders the requisition card for the Lab Notebook on the workbench tab', () => {
        const wrapper = mount(GrindHud);
        expect(wrapper.find('[data-building="notebook"]').exists()).toBe(true);
    });

    it('reveals the Breakthrough lever when totalRpEarned crosses the threshold', async () => {
        const grind = useGrind();
        grind._injectGrantForTests({source: 'recall', scientistId: 'sid', amount: 200_000});
        const wrapper = mount(GrindHud);
        await nextTick();
        expect(wrapper.find('[data-breakthrough-lever]').exists()).toBe(true);
    });

    it('feats tab renders all four theorem branches', async () => {
        const wrapper = mount(GrindHud);
        // Switch to feats tab.
        const feats = wrapper.find('[data-tab="feats"]');
        await feats.trigger('click');
        await nextTick();
        expect(wrapper.find('[data-branch="automation"]').exists()).toBe(true);
        expect(wrapper.find('[data-branch="quantum"]').exists()).toBe(true);
        expect(wrapper.find('[data-branch="chaos"]').exists()).toBe(true);
        expect(wrapper.find('[data-branch="dispatch"]').exists()).toBe(true);
    });

    it('Dispatch branch shows Tireless Bench as a root node', async () => {
        const wrapper = mount(GrindHud);
        const feats = wrapper.find('[data-tab="feats"]');
        await feats.trigger('click');
        await nextTick();
        expect(wrapper.find('[data-theorem="dispatch_tireless_bench"]').exists()).toBe(true);
    });

    it('dossier tab shows Mezzanine stats, not VS Code stats', async () => {
        const wrapper = mount(GrindHud);
        const dossier = wrapper.find('[data-tab="dossier"]');
        await dossier.trigger('click');
        await nextTick();
        const text = wrapper.text();
        expect(text).toContain('Chronicle Lines');
        expect(text).toContain('Dispatches');
        expect(text).toContain('Clean Recalls');
        expect(text).toContain('Mission Time');
        expect(text).not.toContain('Keystrokes');
    });

    it('research tab shows visible upgrades only after the threshold is reached', async () => {
        const grind = useGrind();
        // First, before any RP: no Better Pencils upgrade visible.
        let wrapper = mount(GrindHud);
        let research = wrapper.find('[data-tab="research"]');
        await research.trigger('click');
        await nextTick();
        expect(wrapper.find('[data-upgrade="better_pencils"]').exists()).toBe(false);

        // Inject enough RP to cross the unlock threshold.
        grind._injectGrantForTests({source: 'recall', scientistId: 'sid', amount: 500});
        wrapper = mount(GrindHud);
        research = wrapper.find('[data-tab="research"]');
        await research.trigger('click');
        await nextTick();
        expect(wrapper.find('[data-upgrade="better_pencils"]').exists()).toBe(true);
    });
});
