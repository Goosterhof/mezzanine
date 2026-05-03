import {invoke} from '@tauri-apps/api/core';
import {mount, flushPromises} from '@vue/test-utils';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import ComposeDispatch from '../../src/mission/ComposeDispatch.vue';
import {useMissionControl} from '../../src/mission/useMissionControl';

const mockedInvoke = vi.mocked(invoke);

describe('ComposeDispatch', () => {
    beforeEach(() => {
        useMissionControl().reset();
        mockedInvoke.mockReset();
        mockedInvoke.mockResolvedValue(undefined);
    });

    it('refuses to submit when title or location are blank', async () => {
        const wrapper = mount(ComposeDispatch);
        await wrapper.get('form').trigger('submit.prevent');
        expect(mockedInvoke).not.toHaveBeenCalledWith('write_war_room_dispatch', expect.anything());
        expect(wrapper.text()).toContain('Title and location are required');
    });

    it('submits the populated payload via write_war_room_dispatch and emits close', async () => {
        const wrapper = mount(ComposeDispatch);
        await wrapper.get('input[type="text"]').setValue('Pulse drift');
        const inputs = wrapper.findAll('input[type="text"]');
        await inputs[1]!.setValue('documents/laboratory-pulse.md');
        await wrapper.get('select').setValue('High');
        await wrapper.get('textarea').setValue('Body of the finding.');
        await wrapper.get('form').trigger('submit.prevent');
        await flushPromises();

        const writeCall = mockedInvoke.mock.calls.find(([cmd]) => cmd === 'write_war_room_dispatch');
        expect(writeCall).toBeTruthy();
        expect(writeCall![1]).toStrictEqual({
            finding: {
                title: 'Pulse drift',
                severity: 'High',
                location: 'documents/laboratory-pulse.md',
                bodyMarkdown: 'Body of the finding.',
            },
        });
        expect(wrapper.emitted('close')).toHaveLength(1);
    });

    it('emits close when the Cancel button is clicked', async () => {
        const wrapper = mount(ComposeDispatch);
        await wrapper.get('[data-mc-cancel]').trigger('click');
        expect(wrapper.emitted('close')).toHaveLength(1);
    });
});
