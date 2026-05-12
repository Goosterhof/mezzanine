import {invoke} from '@tauri-apps/api/core';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import type {BalconySigns} from '../../src/balcony/types';

import {useBalconySigns} from '../../src/balcony/useBalconySigns';

const mockedInvoke = vi.mocked(invoke);

interface Deferred<T> {
    promise: Promise<T>;
    resolve: (value: T) => void;
}

function defer<T>(): Deferred<T> {
    let resolver!: (value: T) => void;
    const promise = new Promise<T>((resolve) => {
        resolver = resolve;
    });
    return {promise, resolve: resolver};
}

const PAYLOAD: BalconySigns = {
    lastChaos: {
        reportNumber: 68,
        label: 'Cardinal Candlelight (Parlour)',
        score: '8/10',
        raw: '#00068 — Cardinal Candlelight (Parlour) — 8/10',
    },
    ideaLedger: {candidateCount: 7, shelvedCount: 37, mostRecentDelivered: '2026-04-22'},
};

describe('useBalconySigns', () => {
    beforeEach(() => {
        useBalconySigns().reset();
        mockedInvoke.mockReset();
    });

    describe('refresh', () => {
        it('invokes read_balcony_signs and hydrates the singleton refs', async () => {
            mockedInvoke.mockResolvedValueOnce(PAYLOAD);
            const bs = useBalconySigns();
            await bs.refresh();
            expect(mockedInvoke).toHaveBeenCalledWith('read_balcony_signs');
            expect(bs.signs.value).toStrictEqual(PAYLOAD);
            expect(bs.lastRefreshedAt.value).not.toBeNull();
            expect(bs.lastError.value).toBeNull();
        });

        it('toggles loading while the read is in flight', async () => {
            const deferred = defer<BalconySigns>();
            mockedInvoke.mockReturnValueOnce(deferred.promise);
            const bs = useBalconySigns();
            const pending = bs.refresh();
            expect(bs.loading.value).toBe(true);
            deferred.resolve(PAYLOAD);
            await pending;
            expect(bs.loading.value).toBe(false);
        });

        it('captures errors into lastError and keeps prior data intact', async () => {
            mockedInvoke.mockResolvedValueOnce(PAYLOAD);
            const bs = useBalconySigns();
            await bs.refresh();
            const prior = bs.signs.value;

            mockedInvoke.mockRejectedValueOnce(new Error('CLAUDE.md gone'));
            await bs.refresh();
            expect(bs.lastError.value).toBe('CLAUDE.md gone');
            expect(bs.signs.value).toStrictEqual(prior);
        });
    });
});
