import {mount} from '@vue/test-utils';
import {describe, it, expect, beforeEach} from 'vitest';

import TopBar from '../../src/shell/TopBar.vue';
import {useShell} from '../../src/shell/useShell';

describe('TopBar', () => {
    beforeEach(() => {
        useShell().reset();
    });

    it('renders the workbench banner and version', () => {
        const wrapper = mount(TopBar);
        expect(wrapper.text()).toContain('Workbench');
        expect(wrapper.text()).toContain('v0.1');
    });

    it('renders one button per panel', () => {
        const wrapper = mount(TopBar);
        const buttons = wrapper.findAll('button');
        expect(buttons).toHaveLength(3);
        expect(buttons.map((b) => b.text())).toStrictEqual(['MC', 'DD', 'DS']);
    });

    it('clicking a button opens the corresponding panel', async () => {
        const wrapper = mount(TopBar);
        await wrapper.findAll('button')[0]!.trigger('click');
        expect(useShell().openPanel.value).toBe('mission-control');
    });

    it("clicking the open panel's button closes it", async () => {
        const wrapper = mount(TopBar);
        const drydockButton = wrapper.findAll('button')[1]!;
        await drydockButton.trigger('click');
        await drydockButton.trigger('click');
        expect(useShell().openPanel.value).toBeNull();
    });

    it("highlights the open panel's button with the brass border", async () => {
        const wrapper = mount(TopBar);
        const dossierButton = wrapper.findAll('button')[2]!;
        expect(dossierButton.classes()).not.toContain('border-mz-brass');
        await dossierButton.trigger('click');
        expect(dossierButton.classes()).toContain('border-mz-brass');
    });

    it('only one button is highlighted at a time', async () => {
        const wrapper = mount(TopBar);
        const buttons = wrapper.findAll('button');
        await buttons[0]!.trigger('click');
        await buttons[2]!.trigger('click');
        expect(buttons[0]!.classes()).not.toContain('border-mz-brass');
        expect(buttons[2]!.classes()).toContain('border-mz-brass');
    });

    it('buttons expose a title attribute matching the panel label', () => {
        const wrapper = mount(TopBar);
        const buttons = wrapper.findAll('button');
        expect(buttons[0]!.attributes('title')).toBe('Mission Control');
        expect(buttons[1]!.attributes('title')).toBe('Drydock');
        expect(buttons[2]!.attributes('title')).toBe('Dossier');
    });
});
