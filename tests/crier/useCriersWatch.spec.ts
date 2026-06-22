import {invoke} from '@tauri-apps/api/core';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import type {CrierWatchState} from '../../src/crier/types';

import {useCriersWatch} from '../../src/crier/useCriersWatch';
import {useWizard} from '../../src/wizard/useWizard';

const mockedInvoke = vi.mocked(invoke);

const ARMED_STATE: CrierWatchState = {
    status: 'armed',
    queue: [
        {id: 42, prUrl: 'https://github.com/Goosterhof/zmuuzn-strava/pull/42', repo: 'zmuuzn-strava', reviewCount: 0},
    ],
    lastReadAt: '2026-06-22T14:30:00Z',
    busError: null,
};

/** Force the wizard into a "ready + cleared" state so armOnBoot proceeds. */
function clearWizard(): void {
    const wizard = useWizard();
    wizard.checked.value = true;
    wizard.persisted.value = {...wizard.persisted.value, completedAt: '2026-06-22T00:00:00Z'};
}

describe('useCriersWatch', () => {
    beforeEach(() => {
        useCriersWatch().reset();
        useWizard().reset();
        mockedInvoke.mockReset();
        mockedInvoke.mockResolvedValue(undefined);
    });

    it('reads the watch state and stores it', async () => {
        mockedInvoke.mockResolvedValue(ARMED_STATE);
        const crier = useCriersWatch();
        await crier.readState();
        expect(mockedInvoke).toHaveBeenCalledWith('read_crier_watch_state');
        expect(crier.state.value.status).toBe('armed');
        expect(crier.state.value.queue).toHaveLength(1);
    });

    it('clears the scientist id when a read returns a non-armed status', async () => {
        const crier = useCriersWatch();
        crier.scientistId.value = 'sid-1';
        mockedInvoke.mockResolvedValue({status: 'idle', queue: [], lastReadAt: null, busError: null});
        await crier.readState();
        expect(crier.scientistId.value).toBeNull();
    });

    it('arm dispatches the crier and tracks the returned id', async () => {
        mockedInvoke.mockImplementation((cmd: string) => {
            if (cmd === 'dispatch_crier') {
                return Promise.resolve({id: 'crier-sid'});
            }
            if (cmd === 'read_crier_watch_state') {
                return Promise.resolve(ARMED_STATE);
            }
            return Promise.resolve(undefined);
        });
        const crier = useCriersWatch();
        await crier.arm();
        expect(mockedInvoke).toHaveBeenCalledWith('dispatch_crier');
        expect(crier.scientistId.value).toBe('crier-sid');
    });

    it('arm catches a token-missing dispatch rejection and sets the soft state', async () => {
        mockedInvoke.mockImplementation((cmd: string) => {
            if (cmd === 'dispatch_crier') {
                return Promise.reject(new Error('config corrupted — first-run wizard required'));
            }
            return Promise.resolve(undefined);
        });
        const crier = useCriersWatch();
        await crier.arm();
        expect(crier.state.value.status).toBe('token-missing');
        expect(crier.scientistId.value).toBeNull();
        expect(crier.error.value).toBeNull();
    });

    it('armOnBoot is a no-op while the wizard has not completed', async () => {
        // The wizard is not cleared — needsWalkthrough is true.
        useWizard().checked.value = true;
        const crier = useCriersWatch();
        await crier.armOnBoot();
        expect(mockedInvoke).not.toHaveBeenCalledWith('dispatch_crier');
    });

    it('armOnBoot arms once the wizard has cleared', async () => {
        clearWizard();
        mockedInvoke.mockImplementation((cmd: string) =>
            cmd === 'dispatch_crier' ? Promise.resolve({id: 'boot-sid'}) : Promise.resolve(ARMED_STATE),
        );
        const crier = useCriersWatch();
        await crier.armOnBoot();
        expect(mockedInvoke).toHaveBeenCalledWith('dispatch_crier');
        expect(crier.scientistId.value).toBe('boot-sid');
    });

    it('standDown recalls the crier and resets to idle', async () => {
        const crier = useCriersWatch();
        crier.scientistId.value = 'sid-x';
        await crier.standDown();
        expect(mockedInvoke).toHaveBeenCalledWith('recall_crier');
        expect(crier.scientistId.value).toBeNull();
        expect(crier.state.value.status).toBe('idle');
    });

    it('takeTurn writes /town-crier to the crier PTY when armed', async () => {
        const crier = useCriersWatch();
        crier.scientistId.value = 'sid-turn';
        await crier.takeTurn();
        expect(mockedInvoke).toHaveBeenCalledWith('write_to_scientist', {id: 'sid-turn', input: '/town-crier\n'});
    });

    it('takeTurn is a no-op when no crier session is active', async () => {
        const crier = useCriersWatch();
        crier.scientistId.value = null;
        await crier.takeTurn();
        expect(mockedInvoke).not.toHaveBeenCalledWith('write_to_scientist', expect.anything());
    });

    it('stamps lastNudgeAt from a [crier-doorbell] pushed turn PTY line', () => {
        const crier = useCriersWatch();
        crier.scientistId.value = 'sid-nudge';
        expect(crier.lastNudgeAt.value).toBeNull();
        crier._injectOutputForTests({
            scientist: 'sid-nudge',
            chunk: '[crier-doorbell] pushed turn for request #42 (review_count=0)\n',
        });
        expect(crier.lastNudgeAt.value).not.toBeNull();
    });

    it('ignores PTY output from a different scientist', () => {
        const crier = useCriersWatch();
        crier.scientistId.value = 'sid-mine';
        crier._injectOutputForTests({
            scientist: 'sid-other',
            chunk: '[crier-doorbell] pushed turn for request #1 (review_count=0)\n',
        });
        expect(crier.lastNudgeAt.value).toBeNull();
    });

    it('feeds the crier PTY chunks to the installed terminal sink', () => {
        const crier = useCriersWatch();
        crier.scientistId.value = 'sid-sink';
        const chunks: string[] = [];
        crier.setTerminalSink((chunk) => chunks.push(chunk));
        crier._injectOutputForTests({scientist: 'sid-sink', chunk: 'hello watch glass'});
        expect(chunks).toStrictEqual(['hello watch glass']);
    });

    it('derives lampStatus off when idle', () => {
        const crier = useCriersWatch();
        crier.state.value = {status: 'idle', queue: [], lastReadAt: null, busError: null};
        expect(crier.lampStatus.value).toBe('off');
    });

    it('derives lampStatus watching when armed with no recent nudge', () => {
        const crier = useCriersWatch();
        crier.state.value = {...ARMED_STATE};
        crier.lastNudgeAt.value = null;
        expect(crier.lampStatus.value).toBe('watching');
    });

    it('derives lampStatus nudging when armed with a recent push', () => {
        const crier = useCriersWatch();
        crier.state.value = {...ARMED_STATE};
        crier.lastNudgeAt.value = Date.now();
        expect(crier.lampStatus.value).toBe('nudging');
    });

    it('lampStatus drops to watching once the nudge ages past five minutes', () => {
        const crier = useCriersWatch();
        crier.state.value = {...ARMED_STATE};
        crier.lastNudgeAt.value = Date.now() - 6 * 60 * 1000;
        expect(crier.lampStatus.value).toBe('watching');
    });
});
