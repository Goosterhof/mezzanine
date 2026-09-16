import {invoke} from '@tauri-apps/api/core';
import {mount} from '@vue/test-utils';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import ColleagueBenches from '../../src/roster/ColleagueBenches.vue';
import {useColleagues} from '../../src/roster/useColleagues';
import {useRoster} from '../../src/roster/useRoster';
import {useWizard} from '../../src/wizard/useWizard';

const ipc = vi.mocked(invoke);
describe('the two bench nameplates', () => {
    beforeEach(() => {
        useColleagues().reset();
        useRoster().reset();
        useWizard().reset();
        ipc.mockReset();
    });
    it('introduces both colleagues and prevents opening them before setup', () => {
        const wrapper = mount(ColleagueBenches);
        expect(wrapper.text()).toContain('The Mad Scientist');
        expect(wrapper.text()).toContain('The Heretic');
        expect(wrapper.text()).toContain('Speaking Tube');
        expect(wrapper.findAll('button')).toHaveLength(2);
        for (const button of wrapper.findAll('button')) expect(button.attributes('disabled')).toBeDefined();
        wrapper.unmount();
    });
    it('selects an existing colleague without opening another session', async () => {
        const wizard = useWizard();
        wizard.checked.value = true;
        wizard.persisted.value.completedAt = '2026-09-16';
        useRoster().upsert({
            id: 'h',
            colleague: 'heretic',
            target: {kind: 'lab-root'},
            mission: '',
            state: 'idle',
            startedAt: '',
            lastStateChange: '',
        });
        const wrapper = mount(ColleagueBenches);
        await wrapper.get('[data-colleague="heretic"]').trigger('click');
        expect(useRoster().selected.value).toBe('h');
        expect(ipc).not.toHaveBeenCalled();
        expect(wrapper.get('[data-colleague="heretic"]').attributes('aria-pressed')).toBe('true');
        wrapper.unmount();
    });
});
