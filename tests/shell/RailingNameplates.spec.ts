// RailingNameplates — the railing the roster now lives on (#00057).
//
// Covers the three-tier overflow rule and the two overflow laws:
// SELECTION PROMOTES (a drawer-folded plate pulls onto the rail when
// selected — the plumb-anchor always exists) and CRASH PINS (a crashed
// plate never folds into the drawer).

import {invoke} from '@tauri-apps/api/core';
import {mount} from '@vue/test-utils';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {nextTick} from 'vue';

import type {RecalledScientist, Scientist} from '../../src/roster/types';

import {useIdleWarning} from '../../src/roster/useIdleWarning';
import {useRoster} from '../../src/roster/useRoster';
import {useScientistTerminals} from '../../src/roster/useScientistTerminals';
import RailingNameplates from '../../src/shell/RailingNameplates.vue';

const mockedInvoke = vi.mocked(invoke);

const ANCHOR = Date.parse('2026-06-12T12:00:00Z');

function makeScientist(id: string, startedAt: string, state: Scientist['state'] = 'working'): Scientist {
    return {
        id,
        target: {kind: 'experiment', codename: 'crucible'},
        mission: `mission ${id}`,
        state,
        startedAt,
        lastStateChange: startedAt,
    };
}

function makeRecalled(id: string, recalledAt: string): RecalledScientist {
    return {scientist: makeScientist(id, recalledAt), recalledAt};
}

/** Dispatch `count` scientists a minute apart, oldest first. */
function dispatchMany(count: number): void {
    const roster = useRoster();
    for (let i = 0; i < count; i++) {
        const minute = String(i).padStart(2, '0');
        roster.upsert(makeScientist(`sci-${minute}`, `2026-06-12T11:${minute}:00Z`));
    }
}

// mount() the rail through one helper so spec helpers can share its exact
// wrapper type — `ReturnType<typeof mount>` would resolve to the default
// VueWrapper instantiation and trip no-unsafe-argument at every call site.
function mountRail(options?: Parameters<typeof mount>[1]) {
    return mount(RailingNameplates, options);
}

function visibleIds(wrapper: ReturnType<typeof mountRail>): string[] {
    return wrapper
        .findAll('[data-railing-rail] [data-scientist-id]')
        .map((el) => el.attributes('data-scientist-id') ?? '');
}

describe('RailingNameplates — the Overlook #00057', () => {
    beforeEach(() => {
        useRoster().reset();
        useIdleWarning()._resetForTests();
        useIdleWarning()._setNowForTests(ANCHOR);
        useScientistTerminals().reset();
        mockedInvoke.mockReset();
        mockedInvoke.mockResolvedValue(undefined);
    });

    it('renders as a nav labelled for the dispatched scientists', () => {
        const wrapper = mountRail();
        const nav = wrapper.get('[data-railing]');
        expect(nav.element.tagName).toBe('NAV');
        expect(nav.attributes('aria-label')).toBe('Dispatched scientists');
    });

    it('renders a bare railing when nothing is dispatched — the floor carries the empty voice', () => {
        const wrapper = mountRail();
        expect(wrapper.findAll('[data-scientist-id]')).toHaveLength(0);
        expect(wrapper.text()).not.toContain('Balcony quiet');
    });

    it('renders one plate per dispatched scientist, newest first', () => {
        dispatchMany(3);
        const wrapper = mountRail();
        expect(visibleIds(wrapper)).toStrictEqual(['sci-02', 'sci-01', 'sci-00']);
    });

    it('keeps the rail horizontally scrollable with the brass fade mask', () => {
        dispatchMany(3);
        const wrapper = mountRail();
        const rail = wrapper.get('[data-railing-rail]');
        expect(rail.classes()).toContain('overflow-x-auto');
        expect((rail.element as HTMLElement).style.maskImage).toContain('linear-gradient');
    });

    it('shows no overflow chip at or below the visible cap', () => {
        dispatchMany(6);
        const wrapper = mountRail();
        expect(wrapper.find('[data-railing-more]').exists()).toBe(false);
        expect(visibleIds(wrapper)).toHaveLength(6);
    });

    it('folds surplus plates into a ‹ N more › chip past the cap and condenses the rest', () => {
        dispatchMany(8);
        const wrapper = mountRail();
        expect(visibleIds(wrapper)).toHaveLength(6);
        const chip = wrapper.get('[data-railing-more]');
        expect(chip.text()).toBe('‹ 2 more ›');
        // Heavy overflow: visible plates condense (mission line drops).
        expect(wrapper.find('[data-railing-rail] [data-mission]').exists()).toBe(false);
    });

    it('opens a vertical drawer reusing the ScientistRow layout verbatim', async () => {
        dispatchMany(8);
        const wrapper = mountRail();
        await wrapper.get('[data-railing-more]').trigger('click');
        const drawer = wrapper.get('[data-railing-drawer]');
        const rows = drawer.findAll('[data-scientist-id]');
        // The two oldest dispatches fold into the drawer.
        expect(rows.map((r) => r.attributes('data-scientist-id'))).toStrictEqual(['sci-01', 'sci-00']);
        // ScientistRow's signature: the elapsed + Recall column the
        // nameplate redesigned away survives verbatim in the drawer.
        expect(drawer.find('[data-recall]').exists()).toBe(true);
    });

    it('SELECTION PROMOTES — selecting a drawer-folded plate pulls it onto the rail', async () => {
        dispatchMany(8);
        const wrapper = mountRail();
        expect(visibleIds(wrapper)).not.toContain('sci-00');
        useRoster().select('sci-00');
        await nextTick();
        expect(visibleIds(wrapper)).toContain('sci-00');
        // The rail still wears exactly the cap; someone swapped out.
        expect(visibleIds(wrapper)).toHaveLength(6);
        // The promoted plate carries the plumb-anchor — the signature
        // gesture has no undefined branch.
        expect(wrapper.find('[data-railing-rail] [data-plumb-anchor]').exists()).toBe(true);
    });

    it('SELECTION PROMOTES — a drawer click promotes and the drawer closes', async () => {
        dispatchMany(8);
        const wrapper = mountRail();
        await wrapper.get('[data-railing-more]').trigger('click');
        const drawer = wrapper.get('[data-railing-drawer]');
        await drawer.get('[data-scientist-id="sci-00"]').trigger('click');
        await nextTick();
        expect(useRoster().selected.value).toBe('sci-00');
        expect(visibleIds(wrapper)).toContain('sci-00');
        expect(wrapper.find('[data-railing-drawer]').exists()).toBe(false);
    });

    it('SELECTION PROMOTES — the least-recently-selected visible plate swaps out', async () => {
        dispatchMany(8);
        const roster = useRoster();
        const wrapper = mountRail();
        // Touch every visible plate except the oldest visible one, so
        // sci-02 becomes the least-recently-selected visible plate.
        for (const id of ['sci-07', 'sci-06', 'sci-05', 'sci-04', 'sci-03']) {
            roster.select(id);
            await nextTick();
        }
        roster.select('sci-00');
        await nextTick();
        const onRail = visibleIds(wrapper);
        expect(onRail).toContain('sci-00');
        expect(onRail).not.toContain('sci-02');
    });

    it('CRASH PINS — a crashed plate never folds into the drawer', async () => {
        dispatchMany(8);
        // The oldest dispatch — first in line for the drawer — crashes.
        useRoster().upsert(makeScientist('sci-00', '2026-06-12T11:00:00Z', 'crashed'));
        const wrapper = mountRail();
        expect(visibleIds(wrapper)).toContain('sci-00');
        await wrapper.get('[data-railing-more]').trigger('click');
        const drawer = wrapper.get('[data-railing-drawer]');
        const drawerIds = drawer.findAll('[data-scientist-id]').map((r) => r.attributes('data-scientist-id'));
        expect(drawerIds).not.toContain('sci-00');
        expect(drawer.findAll('[data-state="crashed"]')).toHaveLength(0);
    });

    it('exposes scrollToPlate that slides the selected plate into view on the horizontal axis', () => {
        dispatchMany(2);
        const wrapper = mountRail({attachTo: document.body});
        const plate = wrapper.get('[data-scientist-id="sci-01"]').element as HTMLElement;
        const scrollSpy = vi.fn<(options?: ScrollIntoViewOptions) => void>();
        plate.scrollIntoView = scrollSpy;
        (wrapper.vm as unknown as {scrollToPlate: (id: string) => void}).scrollToPlate('sci-01');
        expect(scrollSpy).toHaveBeenCalledWith({behavior: 'smooth', inline: 'nearest', block: 'nearest'});
        wrapper.unmount();
    });

    it('docks the Recently Recalled strip in horizontal form at the right end of the railing', () => {
        dispatchMany(1);
        useRoster().setRecalledStrip([makeRecalled('gone', '2026-06-12T11:59:00Z')]);
        const wrapper = mountRail();
        const strip = wrapper.get('[data-recalled-strip]');
        expect(strip.text()).toContain('Recently Recalled');
        // Horizontal posture: the strip is a flex row docked after the rail.
        expect(strip.classes()).toContain('flex');
        expect(strip.classes()).toContain('items-center');
    });

    it('omits the recalled strip when nothing was recently recalled', () => {
        const wrapper = mountRail();
        expect(wrapper.find('[data-recalled-strip]').exists()).toBe(false);
    });
});
