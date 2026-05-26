// useHolotable composable tests — invoke mock + error variant classifier.
//
// The composable mocks `@tauri-apps/api/core` at the test-setup boundary
// (see `tests/setup.ts`); per-test behaviour is mocked through
// `mockedInvoke.mockResolvedValueOnce` / `mockRejectedValueOnce`. The
// composable's three operational states — loading, success, error — and
// the two error-variant classifications get separate `it()` blocks.

import {invoke} from '@tauri-apps/api/core';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import type {DashboardState} from '../../src/holotable/types';

import {classifyError, useHolotable} from '../../src/holotable/useHolotable';

const mockedInvoke = vi.mocked(invoke);

interface Deferred<T> {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (reason: unknown) => void;
}

function defer<T>(): Deferred<T> {
    let resolver!: (value: T) => void;
    let rejecter!: (reason: unknown) => void;
    const promise = new Promise<T>((resolve, reject) => {
        resolver = resolve;
        rejecter = reject;
    });
    return {promise, resolve: resolver, reject: rejecter};
}

const SAMPLE: DashboardState = {
    tower: {
        id: 'tower',
        label: 'Zmuuzn',
        kind: 'tower',
        health: 'green',
        branch: 'main',
        dirty: false,
        modifiedCount: 0,
        stagedCount: 0,
        untrackedCount: 0,
        detail: 'Holding steady on main',
    },
    experiments: [
        {
            id: 'experiment-gatekeeper',
            label: 'The Gatekeeper',
            slug: 'gatekeeper',
            kind: 'experiment',
            health: 'green',
            url: 'https://auth.zmuuzn.nl/up',
            gitStatus: 'clean',
            detail: 'Breathing easy — responded in 42ms',
            responseTimeMs: 42,
        },
    ],
    gadgets: [
        {
            id: 'gadget-mezzanine',
            label: 'mezzanine',
            kind: 'gadget',
            health: 'green',
            gitStatus: 'clean',
            detail: 'You are here — the balcony itself',
            isSelf: true,
        },
    ],
    database: {id: 'database', label: 'PostgreSQL', kind: 'database', health: 'green', detail: ''},
    pipeline: {id: 'pipeline', label: 'Railway', kind: 'pipeline', health: 'green', detail: ''},
    branch: 'main',
    dirty: false,
    timestamp: '2026-05-26T14:00:00Z',
};

describe('useHolotable', () => {
    beforeEach(() => {
        useHolotable().reset();
        mockedInvoke.mockReset();
    });

    describe('refresh', () => {
        it('invokes read_holotable_state and hydrates the singleton', async () => {
            mockedInvoke.mockResolvedValueOnce(SAMPLE);
            const ht = useHolotable();
            await ht.refresh();
            expect(mockedInvoke).toHaveBeenCalledWith('read_holotable_state');
            expect(ht.dashboardState.value).toStrictEqual(SAMPLE);
            expect(ht.lastRefreshedAt.value).not.toBeNull();
            expect(ht.lastError.value).toBeNull();
        });

        it('toggles isLoading while the read is in flight', async () => {
            const deferred = defer<DashboardState>();
            mockedInvoke.mockReturnValueOnce(deferred.promise);
            const ht = useHolotable();
            const pending = ht.refresh();
            expect(ht.isLoading.value).toBe(true);
            deferred.resolve(SAMPLE);
            await pending;
            expect(ht.isLoading.value).toBe(false);
        });

        it('classifies a ConfigCorrupt rejection as the pre-wizard variant', async () => {
            mockedInvoke.mockRejectedValueOnce(new Error('config corrupted — first-run wizard required'));
            const ht = useHolotable();
            await ht.refresh();
            expect(ht.lastError.value?.kind).toBe('pre-wizard');
        });

        it('classifies any other rejection as the bridge-failure variant', async () => {
            mockedInvoke.mockRejectedValueOnce(
                new Error('the bridge to WSL2 collapsed — wsl.exe invocation failed: not found'),
            );
            const ht = useHolotable();
            await ht.refresh();
            expect(ht.lastError.value?.kind).toBe('bridge-failure');
        });
    });

    describe('legacyState adapter', () => {
        it('flattens the typed payload into the legacy structure-array shape', async () => {
            mockedInvoke.mockResolvedValueOnce(SAMPLE);
            const ht = useHolotable();
            await ht.refresh();
            const legacy = ht.legacyState.value;
            expect(legacy.branch).toBe('main');
            expect(legacy.structures.length).toBeGreaterThan(0);
            // First structure is always the tower.
            expect(legacy.structures[0]!.type).toBe('tower');
            expect(legacy.structures[0]!.id).toBe('tower');
            // Experiment + gadget + database + pipeline all surface.
            const types = legacy.structures.map((s) => s.type);
            expect(types).toContain('experiment');
            expect(types).toContain('gadget');
            expect(types).toContain('database');
            expect(types).toContain('pipeline');
        });
    });

    describe('classifyError', () => {
        it('routes the literal ConfigCorrupt message to pre-wizard', () => {
            const e = classifyError(new Error('config corrupted — first-run wizard required'));
            expect(e?.kind).toBe('pre-wizard');
        });

        it('routes a partial first-run-wizard mention to pre-wizard', () => {
            const e = classifyError('Config corrupted: first-run wizard required to proceed');
            expect(e?.kind).toBe('pre-wizard');
        });

        it('routes WSL bridge collapse to bridge-failure', () => {
            const e = classifyError(new Error('the bridge to WSL2 collapsed — subprocess failed'));
            expect(e?.kind).toBe('bridge-failure');
        });

        it('routes an unknown rejection to bridge-failure', () => {
            const e = classifyError(42);
            expect(e?.kind).toBe('bridge-failure');
            expect(e?.message).toBe('42');
        });
    });
});
