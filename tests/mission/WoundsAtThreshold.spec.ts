import {mount} from '@vue/test-utils';
import {describe, expect, it} from 'vitest';

import WoundsAtThreshold from '../../src/mission/WoundsAtThreshold.vue';

describe('WoundsAtThreshold', () => {
    it('renders the empty state when no wounds are present', () => {
        const wrapper = mount(WoundsAtThreshold, {props: {wounds: []}});
        expect(wrapper.text()).toContain('No wounds at threshold.');
    });

    it('renders one entry per wound with filename and YYYY-MM-DD modified date', () => {
        const wrapper = mount(WoundsAtThreshold, {
            props: {
                wounds: [
                    {filename: 'wound-2026-04-30.md', modifiedAt: '2026-04-30T10:30:00Z', sizeBytes: 200},
                    {filename: 'wound-2026-05-01.md', modifiedAt: '2026-05-01T08:15:00Z', sizeBytes: 300},
                ],
            },
        });
        const items = wrapper.findAll('li');
        expect(items).toHaveLength(2);
        expect(items[0]!.text()).toContain('wound-2026-04-30.md');
        expect(items[0]!.text()).toContain('2026-04-30');
        expect(items[1]!.text()).toContain('wound-2026-05-01.md');
        expect(items[1]!.text()).toContain('2026-05-01');
    });
});
