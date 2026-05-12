import {beforeEach, describe, expect, it} from 'vitest';

import type {Scientist} from '../../src/roster/types';

import {useRoster} from '../../src/roster/useRoster';

function makeScientist(overrides: Partial<Scientist> = {}): Scientist {
    return {
        id: '11111111-1111-4111-8111-111111111111',
        target: {kind: 'experiment', codename: 'crucible'},
        mission: 'check phpstan',
        state: 'working',
        startedAt: '2026-05-12T10:00:00Z',
        lastStateChange: '2026-05-12T10:00:00Z',
        ...overrides,
    };
}

describe('useRoster — Phase 2A', () => {
    beforeEach(() => {
        useRoster().reset();
    });

    it('starts empty with no selection', () => {
        const r = useRoster();
        expect(r.scientists.value).toStrictEqual([]);
        expect(r.recalledStrip.value).toStrictEqual([]);
        expect(r.selected.value).toBeNull();
        expect(r.selectedScientist.value).toBeNull();
    });

    it('upsert adds a new scientist', () => {
        const r = useRoster();
        const s = makeScientist();
        r.upsert(s);
        expect(r.scientists.value).toHaveLength(1);
        expect(r.scientists.value[0]).toStrictEqual(s);
    });

    it('upsert updates an existing scientist in place by id', () => {
        const r = useRoster();
        r.upsert(makeScientist({state: 'working'}));
        r.upsert(makeScientist({state: 'awaiting'}));
        expect(r.scientists.value).toHaveLength(1);
        expect(r.scientists.value[0]!.state).toBe('awaiting');
    });

    it('remove drops the scientist and selects the most recent survivor', () => {
        const r = useRoster();
        const older = makeScientist({id: 'a', startedAt: '2026-05-12T09:00:00Z'});
        const newer = makeScientist({id: 'b', startedAt: '2026-05-12T10:00:00Z'});
        r.upsert(older);
        r.upsert(newer);
        r.select('b');
        r.remove('b');
        expect(r.scientists.value).toHaveLength(1);
        expect(r.selected.value).toBe('a');
    });

    it('remove on an unselected scientist leaves selection alone', () => {
        const r = useRoster();
        r.upsert(makeScientist({id: 'a'}));
        r.upsert(makeScientist({id: 'b'}));
        r.select('a');
        r.remove('b');
        expect(r.selected.value).toBe('a');
    });

    it('remove of the only scientist clears selection', () => {
        const r = useRoster();
        r.upsert(makeScientist({id: 'a'}));
        r.select('a');
        r.remove('a');
        expect(r.selected.value).toBeNull();
    });

    it('replace swaps the roster wholesale and keeps a valid selection', () => {
        const r = useRoster();
        r.upsert(makeScientist({id: 'a'}));
        r.select('a');
        r.replace([makeScientist({id: 'a'}), makeScientist({id: 'b', startedAt: '2026-05-12T11:00:00Z'})]);
        expect(r.scientists.value).toHaveLength(2);
        expect(r.selected.value).toBe('a');
    });

    it('replace falls back to the most-recent scientist when the selection vanishes', () => {
        const r = useRoster();
        r.upsert(makeScientist({id: 'a', startedAt: '2026-05-12T09:00:00Z'}));
        r.select('a');
        r.replace([
            makeScientist({id: 'b', startedAt: '2026-05-12T10:00:00Z'}),
            makeScientist({id: 'c', startedAt: '2026-05-12T11:00:00Z'}),
        ]);
        expect(r.selected.value).toBe('c');
    });

    it('replace into an empty list with no prior selection leaves selection null', () => {
        const r = useRoster();
        r.replace([]);
        expect(r.selected.value).toBeNull();
    });

    it('selectedScientist returns the live record for the selected id', () => {
        const r = useRoster();
        const s = makeScientist({id: 'a'});
        r.upsert(s);
        r.select('a');
        expect(r.selectedScientist.value).toStrictEqual(s);
    });

    it('selectedScientist returns null when selection points to a non-existent id', () => {
        const r = useRoster();
        r.select('ghost');
        expect(r.selectedScientist.value).toBeNull();
    });

    it('setRecalledStrip replaces the strip wholesale', () => {
        const r = useRoster();
        r.setRecalledStrip([{scientist: makeScientist({id: 'x'}), recalledAt: '2026-05-12T10:00:00Z'}]);
        expect(r.recalledStrip.value).toHaveLength(1);
        r.setRecalledStrip([]);
        expect(r.recalledStrip.value).toStrictEqual([]);
    });

    it('select(null) clears the selection without touching the roster', () => {
        const r = useRoster();
        r.upsert(makeScientist({id: 'a'}));
        r.select('a');
        r.select(null);
        expect(r.selected.value).toBeNull();
        expect(r.scientists.value).toHaveLength(1);
    });
});
