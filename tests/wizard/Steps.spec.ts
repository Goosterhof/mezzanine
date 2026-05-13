// Step component specs — the three lab/binary/chronicle panels read draft
// state from the useWizard singleton. Each spec seeds the composable and
// mounts the step in isolation to keep coverage tight and avoid replaying
// the boot dance in every test.

import {mount} from '@vue/test-utils';
import {beforeEach, describe, expect, it} from 'vitest';

import StepBinary from '../../src/wizard/StepBinary.vue';
import StepChronicle from '../../src/wizard/StepChronicle.vue';
import StepLaboratory from '../../src/wizard/StepLaboratory.vue';
import {useWizard} from '../../src/wizard/useWizard';

describe('StepLaboratory', () => {
    beforeEach(() => useWizard().reset());

    it('renders the step header in balcony voice', () => {
        const wrapper = mount(StepLaboratory);
        expect(wrapper.text()).toContain('Where does the laboratory live?');
        expect(wrapper.text()).toContain('Step 1 of 3');
    });

    it('binds the input value to the wizard draft', () => {
        useWizard().setLabRoot('/seed/lab');
        const wrapper = mount(StepLaboratory);
        const input = wrapper.get('[data-wizard-lab-root]').element as HTMLInputElement;
        expect(input.value).toBe('/seed/lab');
    });

    it('input edits flow through into the composable draft', async () => {
        const wrapper = mount(StepLaboratory);
        await wrapper.get('[data-wizard-lab-root]').setValue('/typed/path');
        expect(useWizard().labRootDraft.value).toBe('/typed/path');
    });

    it('renders the detected default beneath the input', () => {
        useWizard().detected.value = {labRoot: '/detected/lab', claudeBinary: 'claude', hostPlatform: 'unix'};
        const wrapper = mount(StepLaboratory);
        expect(wrapper.text()).toContain('/detected/lab');
    });
});

describe('StepBinary', () => {
    beforeEach(() => useWizard().reset());

    it('renders the step header in balcony voice', () => {
        const wrapper = mount(StepBinary);
        expect(wrapper.text()).toContain('Step 2 of 3');
        expect(wrapper.text()).toContain('claude');
    });

    it('binds the input to the claude binary draft and writes back on edit', async () => {
        useWizard().setClaudeBinary('claude');
        const wrapper = mount(StepBinary);
        const input = wrapper.get('[data-wizard-claude-binary]').element as HTMLInputElement;
        expect(input.value).toBe('claude');
        await wrapper.get('[data-wizard-claude-binary]').setValue('/opt/claude/bin/claude');
        expect(useWizard().claudeBinaryDraft.value).toBe('/opt/claude/bin/claude');
    });

    it('falls back to "claude" in the detected line when the backend reports nothing', () => {
        useWizard().detected.value = {labRoot: '', claudeBinary: '', hostPlatform: 'unix'};
        const wrapper = mount(StepBinary);
        const lines = wrapper.findAll('p');
        const detected = lines.find((p) => p.text().includes('Detected:'));
        expect(detected?.text()).toContain('claude');
    });
});

describe('StepChronicle', () => {
    beforeEach(() => useWizard().reset());

    it('renders the step header and the dispatched-model copy', () => {
        const wrapper = mount(StepChronicle);
        expect(wrapper.text()).toContain('Step 3 of 3');
        expect(wrapper.text()).toContain('Every mission keeps a record');
        // No bench-era residue.
        expect(wrapper.text()).not.toMatch(/bench/i);
        expect(wrapper.text()).not.toMatch(/apprentice/i);
        // New path, not the cockpit one.
        expect(wrapper.text()).toContain('.zmuuzn-mezzanine');
        expect(wrapper.text()).not.toContain('.zmuuzn-cockpit');
    });

    it('renders the wizard error inline when present', () => {
        useWizard().lastError.value = 'disk corrupt';
        const wrapper = mount(StepChronicle);
        expect(wrapper.find('[data-wizard-error]').text()).toBe('disk corrupt');
    });

    it('omits the error block when there is no error', () => {
        const wrapper = mount(StepChronicle);
        expect(wrapper.find('[data-wizard-error]').exists()).toBe(false);
    });
});
