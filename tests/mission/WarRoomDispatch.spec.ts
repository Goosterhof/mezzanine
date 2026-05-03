import {mount} from '@vue/test-utils';
import {describe, expect, it} from 'vitest';

import WarRoomDispatch from '../../src/mission/WarRoomDispatch.vue';

describe('WarRoomDispatch', () => {
    it('renders the empty state from The Voice when no findings', () => {
        const wrapper = mount(WarRoomDispatch, {props: {findings: []}});
        expect(wrapper.text()).toContain('No active dispatches. Tools racked.');
    });

    it('renders one entry per finding with title, location, severity', () => {
        const wrapper = mount(WarRoomDispatch, {
            props: {
                findings: [
                    {
                        number: 1,
                        title: 'CLAUDE.md Inventory Drift',
                        severity: 'Medium',
                        location: 'experiments/zmuuzn-strava/CLAUDE.md',
                        bodyMarkdown: 'body text',
                    },
                    {
                        number: 5,
                        title: 'Helper duplication',
                        severity: 'Low',
                        location: 'experiments/zmuuzn-smokestacks/backend/app/Actions/',
                        bodyMarkdown: 'body',
                    },
                ],
            },
        });
        const items = wrapper.findAll('li');
        expect(items).toHaveLength(2);
        expect(items[0]!.text()).toContain('CLAUDE.md Inventory Drift');
        expect(items[0]!.text()).toContain('Medium');
        expect(items[0]!.text()).toContain('zmuuzn-strava');
        expect(items[1]!.text()).toContain('#5');
        expect(items[1]!.text()).toContain('Low');
    });

    it('emits compose when the Compose Dispatch button is clicked', async () => {
        const wrapper = mount(WarRoomDispatch, {props: {findings: []}});
        await wrapper.get('[data-mc-compose]').trigger('click');
        expect(wrapper.emitted('compose')).toHaveLength(1);
    });
});
