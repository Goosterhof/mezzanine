import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {_resetForTests, useLastKeystroke} from '../../src/command/useLastKeystroke';

describe('when the investor last typed (#00067 P2)', () => {
    let now = 1000;
    beforeEach(() => {
        _resetForTests();
        vi.spyOn(performance, 'now').mockImplementation(() => now);
    });
    afterEach(() => vi.restoreAllMocks());

    it('should read infinitely quiet before the first keystroke', () => {
        expect(useLastKeystroke().msSince()).toBe(Number.POSITIVE_INFINITY);
    });

    it('should count milliseconds since the last note, across every caller', () => {
        useLastKeystroke().note();
        now = 2500;
        expect(useLastKeystroke().msSince()).toBe(1500);
    });
});
