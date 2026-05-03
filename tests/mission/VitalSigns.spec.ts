import {mount} from '@vue/test-utils';
import {describe, expect, it} from 'vitest';

import {EMPTY_VITAL_SIGNS} from '../../src/mission/types';
import VitalSigns from '../../src/mission/VitalSigns.vue';

describe('VitalSigns', () => {
    it('renders the five stat boxes when populated', () => {
        const wrapper = mount(VitalSigns, {
            props: {
                signs: {
                    ...EMPTY_VITAL_SIGNS,
                    experimentsActive: 6,
                    experimentsSummary: '6 active',
                    gadgetsCalibrated: 5,
                    minionsOperational: 18,
                    sentinelsWatching: 4,
                    packagesPublished: 1,
                    lastChaos: '#00068 — Cardinal Candlelight (Parlour) — 8/10',
                    chaosFiled: '68 reports',
                    enhanceFiled: '5 reports',
                },
            },
        });
        expect(wrapper.text()).toContain('Experiments');
        expect(wrapper.text()).toContain('6');
        expect(wrapper.text()).toContain('Gadgets');
        expect(wrapper.text()).toContain('Minions');
        expect(wrapper.text()).toContain('18');
        expect(wrapper.text()).toContain('Last Chaos');
        expect(wrapper.text()).toContain('#00068');
        expect(wrapper.text()).toContain('5 reports');
    });

    it('renders the unreadable empty state when no values parsed', () => {
        const wrapper = mount(VitalSigns, {props: {signs: {...EMPTY_VITAL_SIGNS}}});
        expect(wrapper.text()).toContain('Vital signs unreadable');
    });

    it('shows an em-dash when an individual value is missing', () => {
        const wrapper = mount(VitalSigns, {
            props: {signs: {...EMPTY_VITAL_SIGNS, experimentsActive: 6, minionsOperational: null}},
        });
        expect(wrapper.text()).toContain('—');
    });
});
