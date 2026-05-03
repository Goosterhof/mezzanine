import {invoke} from '@tauri-apps/api/core';
import {flushPromises, mount} from '@vue/test-utils';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import PrivacyDisclosure from '../../src/chronicle/PrivacyDisclosure.vue';
import {useDisclosure} from '../../src/chronicle/useDisclosure';

const mockedInvoke = vi.mocked(invoke);

describe('PrivacyDisclosure', () => {
    beforeEach(() => {
        useDisclosure().reset();
        mockedInvoke.mockReset();
    });

    it('renders the modal when no ack exists', async () => {
        mockedInvoke.mockResolvedValueOnce(null);
        await useDisclosure().loadStatus();
        const wrapper = mount(PrivacyDisclosure);
        expect(wrapper.find('[data-modal="chronicle-disclosure"]').exists()).toBe(true);
        expect(wrapper.text()).toContain('The Chronicle');
        expect(wrapper.text()).toContain('begin chronicling');
    });

    it('does not render when an ack already exists', async () => {
        mockedInvoke.mockResolvedValueOnce('2026-05-04T08:00:00Z');
        await useDisclosure().loadStatus();
        const wrapper = mount(PrivacyDisclosure);
        expect(wrapper.find('[data-modal="chronicle-disclosure"]').exists()).toBe(false);
    });

    it('clicking the ack button writes the disclosure and dismisses the modal', async () => {
        mockedInvoke.mockResolvedValueOnce(null);
        await useDisclosure().loadStatus();
        const wrapper = mount(PrivacyDisclosure);

        mockedInvoke.mockResolvedValueOnce('2026-05-04T09:00:00Z');
        await wrapper.get('[data-disclosure-ack]').trigger('click');
        await flushPromises();

        expect(mockedInvoke).toHaveBeenLastCalledWith('write_chronicle_disclosure_ack');
        expect(wrapper.find('[data-modal="chronicle-disclosure"]').exists()).toBe(false);
    });
});
