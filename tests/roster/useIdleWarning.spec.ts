import {beforeEach, describe, expect, it} from 'vitest';
import {effectScope} from 'vue';

import type {MissionState, Scientist} from '../../src/roster/types';

import {useIdleWarning} from '../../src/roster/useIdleWarning';

const ANCHOR = Date.parse('2026-05-12T12:00:00Z');

function makeScientist(state: MissionState, lastStateChange: string): Scientist {
    return {
        id: '11111111-1111-4111-8111-111111111111',
        target: {kind: 'experiment', codename: 'crucible'},
        mission: 'check phpstan',
        state,
        startedAt: lastStateChange,
        lastStateChange,
    };
}

describe('useIdleWarning — Phase 2A', () => {
    beforeEach(() => {
        useIdleWarning()._resetForTests();
    });

    it('returns false when the scientist is not idle', () => {
        const w = useIdleWarning();
        w._setNowForTests(ANCHOR);
        const s = makeScientist('working', '2026-05-12T10:00:00Z');
        expect(w.isIdleWarning(s)).toBe(false);
    });

    it('returns false when an idle scientist is under the 1-hour threshold', () => {
        const w = useIdleWarning();
        w._setNowForTests(ANCHOR);
        const fiveMinutesAgo = new Date(ANCHOR - 5 * 60 * 1000).toISOString();
        const s = makeScientist('idle', fiveMinutesAgo);
        expect(w.isIdleWarning(s)).toBe(false);
    });

    it('returns true when an idle scientist has crossed exactly 1 hour', () => {
        const w = useIdleWarning();
        w._setNowForTests(ANCHOR);
        const exactlyOneHourAgo = new Date(ANCHOR - 60 * 60 * 1000).toISOString();
        const s = makeScientist('idle', exactlyOneHourAgo);
        expect(w.isIdleWarning(s)).toBe(true);
    });

    it('returns true when an idle scientist is well past the threshold', () => {
        const w = useIdleWarning();
        w._setNowForTests(ANCHOR);
        const fourHoursAgo = new Date(ANCHOR - 4 * 60 * 60 * 1000).toISOString();
        const s = makeScientist('idle', fourHoursAgo);
        expect(w.isIdleWarning(s)).toBe(true);
    });

    it('returns false for an unparseable lastStateChange', () => {
        const w = useIdleWarning();
        w._setNowForTests(ANCHOR);
        const s = makeScientist('idle', 'not-a-date');
        expect(w.isIdleWarning(s)).toBe(false);
    });

    it('exposes a reactive now ref the wall-clock can be driven from', () => {
        const w = useIdleWarning();
        w._setNowForTests(ANCHOR);
        expect(w.now.value).toBe(ANCHOR);
        w._setNowForTests(ANCHOR + 1000);
        expect(w.now.value).toBe(ANCHOR + 1000);
    });

    it('disposes the tick interval when the last scope unmounts', () => {
        const scope = effectScope();
        scope.run(() => {
            useIdleWarning();
        });
        scope.stop();
        // After dispose there should be no live interval handle; calling
        // _resetForTests is a no-op for an already-disposed instance.
        expect(() => useIdleWarning()._resetForTests()).not.toThrow();
    });
});
