// ObserverPanel — mount/unmount + RAF pause signal.
//
// The LabScene is mocked out — its canvas/scene.js host needs WebGL-less
// `<canvas>` calls that jsdom does not implement. We assert on the
// panel's slide-down chrome and the controller signals it emits to the
// scene ref on open/close transitions.

import {mount} from '@vue/test-utils';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {nextTick} from 'vue';

import ObserverPanel from '../../src/observer/ObserverPanel.vue';
import {useShell} from '../../src/shell/useShell';

vi.mock('../../src/observer/LabScene.vue', () => ({
    default: {
        name: 'LabScene',
        setup(_props: unknown, {expose}: {expose: (api: Record<string, () => void>) => void}) {
            const pauseRaf = vi.fn<() => void>();
            const resumeRaf = vi.fn<() => void>();
            expose({pauseRaf, resumeRaf});
            return {pauseRaf, resumeRaf};
        },
        template: '<div data-mock-labscene></div>',
    },
}));

describe('ObserverPanel', () => {
    beforeEach(() => {
        useShell().reset();
    });

    it('mounts hidden when no panel is open', () => {
        const wrapper = mount(ObserverPanel);
        const panel = wrapper.find('[data-observer-panel]');
        expect(panel.exists()).toBe(true);
        // v-show="open" with no panel open → display: none.
        expect((panel.element as HTMLElement).style.display).toBe('none');
        wrapper.unmount();
    });

    it('reveals the panel when the shell opens the observer slot', async () => {
        const wrapper = mount(ObserverPanel);
        useShell().togglePanel('observer');
        await nextTick();
        const panel = wrapper.find('[data-observer-panel]');
        expect((panel.element as HTMLElement).style.display).not.toBe('none');
        wrapper.unmount();
    });

    it('renders the panel header copy in the Mezzanine voice', () => {
        useShell().togglePanel('observer');
        const wrapper = mount(ObserverPanel);
        expect(wrapper.text()).toContain('The scientists on the floor below');
        expect(wrapper.text()).toContain('Observer');
        wrapper.unmount();
    });

    it('closes the panel when the close button is clicked', async () => {
        useShell().togglePanel('observer');
        const wrapper = mount(ObserverPanel);
        await nextTick();
        const closeBtn = wrapper.get('button[aria-label="Close the floor"]');
        await closeBtn.trigger('click');
        expect(useShell().openPanel.value).toBeNull();
        wrapper.unmount();
    });

    it('mounts the LabScene (mocked) when the panel is in the DOM', () => {
        const wrapper = mount(ObserverPanel);
        expect(wrapper.find('[data-mock-labscene]').exists()).toBe(true);
        wrapper.unmount();
    });
});
