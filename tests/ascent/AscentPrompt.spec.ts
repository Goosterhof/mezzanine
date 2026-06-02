import {mount} from '@vue/test-utils';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import AscentPrompt from '../../src/ascent/AscentPrompt.vue';
import {useAscent} from '../../src/ascent/useAscent';

// The prompt is presentational — it reads the composable and renders the
// balcony voice. Mock the composable to a controllable bag of refs so each
// status can be driven directly without standing up the plugin bridge.
vi.mock('../../src/ascent/useAscent', async () => {
    const {ref} = await import('vue');
    const state = {
        status: ref('idle'),
        availableVersion: ref<string | null>(null),
        downloadPct: ref(0),
        visible: ref(false),
        isSteppingDown: ref(false),
        showsCurrent: ref(false),
        check: vi.fn<() => void>(),
        descend: vi.fn<() => void>(),
        dismiss: vi.fn<() => void>(),
    };
    return {useAscent: () => state};
});

// Typed handle on the mocked singleton.
const ascent = useAscent() as unknown as {
    status: {value: string};
    availableVersion: {value: string | null};
    downloadPct: {value: number};
    visible: {value: boolean};
    isSteppingDown: {value: boolean};
    showsCurrent: {value: boolean};
    descend: ReturnType<typeof vi.fn>;
    dismiss: ReturnType<typeof vi.fn>;
};

function resetAscent(): void {
    ascent.status.value = 'idle';
    ascent.availableVersion.value = null;
    ascent.downloadPct.value = 0;
    ascent.visible.value = false;
    ascent.isSteppingDown.value = false;
    ascent.showsCurrent.value = false;
    ascent.descend.mockClear();
    ascent.dismiss.mockClear();
}

describe('AscentPrompt', () => {
    beforeEach(() => {
        resetAscent();
    });

    it('renders nothing while the balcony is current and silent', () => {
        const wrapper = mount(AscentPrompt);

        expect(wrapper.find('[data-ascent-status]').exists()).toBe(false);
    });

    it('offers the descent in the balcony voice with both choices', () => {
        ascent.status.value = 'available';
        ascent.availableVersion.value = '0.3.0';
        ascent.visible.value = true;
        const wrapper = mount(AscentPrompt);

        expect(wrapper.find('[data-ascent-status]').attributes('data-ascent-status')).toBe('available');
        expect(wrapper.text()).toContain('A newer balcony stands ready — v0.3.0. Descend to raise it?');
        const buttons = wrapper.findAll('button');
        expect(buttons.map((b) => b.text())).toStrictEqual(['Descend', 'Stay upstairs']);
    });

    it('Descend drives the composable; Stay upstairs dismisses', async () => {
        ascent.status.value = 'available';
        ascent.availableVersion.value = '0.3.0';
        ascent.visible.value = true;
        const wrapper = mount(AscentPrompt);

        await wrapper.findAll('button')[0]!.trigger('click');
        expect(ascent.descend).toHaveBeenCalledOnce();

        await wrapper.findAll('button')[1]!.trigger('click');
        expect(ascent.dismiss).toHaveBeenCalledOnce();
    });

    it('shows the raising-progress copy and a progress bar mid-descent', () => {
        ascent.status.value = 'downloading';
        ascent.downloadPct.value = 42;
        ascent.visible.value = true;
        const wrapper = mount(AscentPrompt);

        expect(wrapper.text()).toContain('Raising the new balcony… 42%');
        const bar = wrapper.find('[data-ascent-progress]');
        expect(bar.exists()).toBe(true);
        expect(bar.attributes('style')).toContain('width: 42%');
        expect(wrapper.findAll('button')).toHaveLength(0);
    });

    it('shows the stepping-down copy at 100% with no progress bar', () => {
        ascent.status.value = 'downloading';
        ascent.downloadPct.value = 100;
        ascent.isSteppingDown.value = true;
        ascent.visible.value = true;
        const wrapper = mount(AscentPrompt);

        expect(wrapper.text()).toContain('Stepping down while the balcony is rebuilt. Back upstairs in a moment.');
        expect(wrapper.find('[data-ascent-progress]').exists()).toBe(false);
    });

    it('states a signature rejection plainly and offers only dismiss', async () => {
        ascent.status.value = 'rejected';
        ascent.visible.value = true;
        const wrapper = mount(AscentPrompt);

        expect(wrapper.text()).toContain('That balcony was not stamped by the laboratory. Refused.');
        const root = wrapper.find('[data-ascent-status]');
        expect(root.classes()).toContain('border-mz-pulse-crashed');
        const buttons = wrapper.findAll('button');
        expect(buttons).toHaveLength(1);
        expect(buttons[0]!.text()).toBe('Dismiss');

        await buttons[0]!.trigger('click');
        expect(ascent.dismiss).toHaveBeenCalledOnce();
    });

    it('shows the network-failure copy on error', () => {
        ascent.status.value = 'error';
        ascent.visible.value = true;
        const wrapper = mount(AscentPrompt);

        expect(wrapper.text()).toContain('Could not see the floor below. The balcony stands as it is.');
        expect(wrapper.findAll('button')).toHaveLength(1);
    });

    it('confirms "Balcony current" after a manual check', () => {
        ascent.status.value = 'idle';
        ascent.showsCurrent.value = true;
        ascent.visible.value = true;
        const wrapper = mount(AscentPrompt);

        expect(wrapper.text()).toContain('Balcony current. Nothing waiting below.');
        expect(wrapper.find('[data-ascent-status]').classes()).toContain('border-mz-brass-dim');
    });
});
