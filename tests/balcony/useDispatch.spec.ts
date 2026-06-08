import {invoke} from '@tauri-apps/api/core';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import type {Scientist} from '../../src/roster/types';

import {useDispatch} from '../../src/balcony/useDispatch';
import {useRoster} from '../../src/roster/useRoster';

const mockedInvoke = vi.mocked(invoke);

function fakeScientist(mission: string): Scientist {
    return {
        id: '00000000-0000-4000-8000-000000000000',
        target: {kind: 'lab-root'},
        mission,
        state: 'working',
        startedAt: '2026-06-08T00:00:00Z',
        lastStateChange: '2026-06-08T00:00:00Z',
    };
}

/** Stub the IPC surface useDispatch.submit() touches: dispatch_scientist
 *  (the real call) plus start_watching_scientist (fired by the backend
 *  after dispatch). The mission asserted on is read from `mock.calls`, so
 *  the stub returns a fixed scientist. */
function stubDispatchOk(): void {
    mockedInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'dispatch_scientist') {
            return Promise.resolve(fakeScientist('@agent-x'));
        }
        return Promise.resolve(undefined);
    });
}

function lastDispatchMission(): string | undefined {
    const call = [...mockedInvoke.mock.calls].reverse().find((c) => c[0] === 'dispatch_scientist');
    return (call?.[1] as {mission?: string} | undefined)?.mission;
}

describe('useDispatch — minion-only dispatch', () => {
    beforeEach(() => {
        useDispatch().reset();
        useRoster().reset();
        mockedInvoke.mockReset();
        mockedInvoke.mockResolvedValue(undefined);
    });

    it('starts closed with no minion selected', () => {
        const d = useDispatch();
        expect(d.open.value).toBe(false);
        expect(d.minionSlug.value).toBeNull();
    });

    it('selectMinion sets the slug; null clears it back to no minion', () => {
        const d = useDispatch();
        d.selectMinion('inspector');
        expect(d.minionSlug.value).toBe('inspector');
        d.selectMinion(null);
        expect(d.minionSlug.value).toBeNull();
    });

    it('canSubmit is true even with no minion (a plain session is valid)', () => {
        const d = useDispatch();
        expect(d.canSubmit.value).toBe(true);
    });

    it('submit dispatches @agent-<slug> into the lab when a minion is picked', async () => {
        const d = useDispatch();
        d.show();
        d.selectMinion('surgeon');
        stubDispatchOk();
        await d.submit();
        const call = mockedInvoke.mock.calls.find((c) => c[0] === 'dispatch_scientist');
        expect(call?.[1]).toMatchObject({target: {kind: 'lab-root'}, mission: '@agent-surgeon'});
    });

    it('submit dispatches an empty mission for a plain (no-minion) session', async () => {
        const d = useDispatch();
        d.show();
        d.selectMinion(null);
        stubDispatchOk();
        await d.submit();
        expect(lastDispatchMission()).toBe('');
    });

    it('submit clears the selection and closes the sheet on success', async () => {
        const d = useDispatch();
        d.show();
        d.selectMinion('muse');
        stubDispatchOk();
        await d.submit();
        expect(d.minionSlug.value).toBeNull();
        expect(d.open.value).toBe(false);
        expect(d.lastError.value).toBeNull();
    });

    it('submit surfaces the error and keeps the sheet open on failure', async () => {
        const d = useDispatch();
        d.show();
        d.selectMinion('inspector');
        mockedInvoke.mockImplementation((cmd: string) => {
            if (cmd === 'dispatch_scientist') {
                return Promise.reject(new Error('Backend refused the dispatch.'));
            }
            return Promise.resolve(undefined);
        });
        await d.submit();
        expect(d.lastError.value).toBe('Backend refused the dispatch.');
        expect(d.open.value).toBe(true);
        // The selection survives so the investor can retry.
        expect(d.minionSlug.value).toBe('inspector');
    });
});
