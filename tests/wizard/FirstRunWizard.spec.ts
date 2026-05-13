import {invoke} from '@tauri-apps/api/core';
import {flushPromises, mount} from '@vue/test-utils';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import type {WizardDetected, WizardState} from '../../src/wizard/types';

import FirstRunWizard from '../../src/wizard/FirstRunWizard.vue';
import {useWizard} from '../../src/wizard/useWizard';

const mockedInvoke = vi.mocked(invoke);

const DETECTED: WizardDetected = {labRoot: '/home/scientist/code/zmuuzn', claudeBinary: 'claude', hostPlatform: 'unix'};

function persistedNull(): WizardState {
    return {completedAt: null, labRoot: null, claudeBinary: null};
}

function persistedComplete(): WizardState {
    return {completedAt: '2026-05-13T14:00:00Z', labRoot: '/home/scientist/code/zmuuzn', claudeBinary: 'claude'};
}

function mockBoot(state: WizardState, det: WizardDetected = DETECTED): void {
    mockedInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'read_wizard_state') return Promise.resolve(state);
        if (cmd === 'read_wizard_detected') return Promise.resolve(det);
        return Promise.resolve(undefined);
    });
}

describe('FirstRunWizard', () => {
    beforeEach(() => {
        useWizard().reset();
        mockedInvoke.mockReset();
    });

    it('does not mount while loadStatus has not resolved', () => {
        const wrapper = mount(FirstRunWizard);
        expect(wrapper.find('[data-modal="first-run-wizard"]').exists()).toBe(false);
    });

    it('mounts when no completion stamp is persisted', async () => {
        mockBoot(persistedNull());
        await useWizard().loadStatus();
        const wrapper = mount(FirstRunWizard);
        expect(wrapper.find('[data-modal="first-run-wizard"]').exists()).toBe(true);
        expect(wrapper.text()).toContain('Welcome to the balcony');
    });

    it('does not mount when the wizard has already run', async () => {
        mockBoot(persistedComplete());
        await useWizard().loadStatus();
        const wrapper = mount(FirstRunWizard);
        expect(wrapper.find('[data-modal="first-run-wizard"]').exists()).toBe(false);
    });

    it('starts on step 1 (the Laboratory) with Back disabled', async () => {
        mockBoot(persistedNull());
        await useWizard().loadStatus();
        const wrapper = mount(FirstRunWizard);
        expect(wrapper.find('[data-wizard-step="laboratory"]').exists()).toBe(true);
        const back = wrapper.get('[data-wizard-back]');
        expect(back.attributes('disabled')).toBeDefined();
    });

    it('Continue advances through binary then chronicle, where the CTA reads "Open the balcony."', async () => {
        mockBoot(persistedNull());
        await useWizard().loadStatus();
        const wrapper = mount(FirstRunWizard);

        await wrapper.get('[data-wizard-primary]').trigger('click');
        expect(wrapper.find('[data-wizard-step="binary"]').exists()).toBe(true);

        await wrapper.get('[data-wizard-primary]').trigger('click');
        expect(wrapper.find('[data-wizard-step="chronicle"]').exists()).toBe(true);

        const cta = wrapper.get('[data-wizard-primary]');
        expect(cta.text()).toContain('Open the balcony.');
    });

    it('Back walks the steps backwards', async () => {
        mockBoot(persistedNull());
        await useWizard().loadStatus();
        const wrapper = mount(FirstRunWizard);

        await wrapper.get('[data-wizard-primary]').trigger('click');
        await wrapper.get('[data-wizard-primary]').trigger('click');
        await wrapper.get('[data-wizard-back]').trigger('click');
        expect(wrapper.find('[data-wizard-step="binary"]').exists()).toBe(true);
    });

    it('"Open the balcony." dispatches complete_wizard then write_chronicle_disclosure_ack and dismisses', async () => {
        mockBoot(persistedNull());
        await useWizard().loadStatus();
        const wrapper = mount(FirstRunWizard);

        // Walk to step 3 with the detected lab root pre-filled.
        await wrapper.get('[data-wizard-primary]').trigger('click');
        await wrapper.get('[data-wizard-primary]').trigger('click');

        const ordered: string[] = [];
        mockedInvoke.mockImplementation((cmd: string) => {
            ordered.push(cmd);
            if (cmd === 'complete_wizard') {
                return Promise.resolve({
                    completedAt: '2026-05-13T14:00:00Z',
                    labRoot: '/home/scientist/code/zmuuzn',
                    claudeBinary: 'claude',
                });
            }
            if (cmd === 'write_chronicle_disclosure_ack') {
                return Promise.resolve('2026-05-13T14:00:01Z');
            }
            return Promise.resolve(undefined);
        });

        await wrapper.get('[data-wizard-primary]').trigger('click');
        await flushPromises();

        expect(ordered).toStrictEqual(['complete_wizard', 'write_chronicle_disclosure_ack']);
        expect(wrapper.find('[data-modal="first-run-wizard"]').exists()).toBe(false);
    });

    it('renders the backend error on the chronicle step when submit fails', async () => {
        mockBoot(persistedNull());
        await useWizard().loadStatus();
        const wrapper = mount(FirstRunWizard);

        await wrapper.get('[data-wizard-primary]').trigger('click');
        await wrapper.get('[data-wizard-primary]').trigger('click');

        mockedInvoke.mockImplementation((cmd: string) => {
            if (cmd === 'complete_wizard') {
                return Promise.reject(new Error('wizard write failed'));
            }
            return Promise.resolve(undefined);
        });

        await wrapper.get('[data-wizard-primary]').trigger('click');
        await flushPromises();
        expect(wrapper.find('[data-wizard-error]').text()).toBe('wizard write failed');
        // Still mounted — investor can retry.
        expect(wrapper.find('[data-modal="first-run-wizard"]').exists()).toBe(true);
    });

    it('Continue is disabled on step 1 until the investor types a lab root', async () => {
        mockBoot(persistedNull(), {...DETECTED, labRoot: ''});
        await useWizard().loadStatus();
        const wrapper = mount(FirstRunWizard);
        const primary = wrapper.get('[data-wizard-primary]');
        expect(primary.attributes('disabled')).toBeDefined();

        const input = wrapper.get('[data-wizard-lab-root]');
        await input.setValue('/srv/zmuuzn');
        expect(primary.attributes('disabled')).toBeUndefined();
    });
});
