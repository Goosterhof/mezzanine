import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {useBackend} from '../../src/session/useBackend';
import {useSessions} from '../../src/session/useSessions';

const mockedInvoke = vi.mocked(invoke);
const mockedListen = vi.mocked(listen);

interface CapturedHandlers {
    output?: (event: {payload: {experiment: string; chunk: string}}) => void;
    exit?: (event: {payload: {experiment: string; exit_code: number}}) => void;
}

function captureListenHandlers(): CapturedHandlers {
    const captured: CapturedHandlers = {};
    mockedListen.mockImplementation((eventName, handler) => {
        if (eventName === 'pty-output') {
            captured.output = handler as CapturedHandlers['output'];
        } else if (eventName === 'pty-exit') {
            captured.exit = handler as CapturedHandlers['exit'];
        }
        return Promise.resolve(() => {});
    });
    return captured;
}

describe('useBackend', () => {
    beforeEach(() => {
        useSessions().reset();
        useBackend()._resetSubscriptionForTests();
        mockedInvoke.mockReset();
        mockedInvoke.mockResolvedValue(undefined);
        mockedListen.mockReset();
        mockedListen.mockResolvedValue(() => {});
    });

    describe('subscribe', () => {
        it('registers exactly one listener for pty-output and pty-exit', async () => {
            await useBackend().subscribe();
            expect(mockedListen).toHaveBeenCalledTimes(2);
            const eventNames = mockedListen.mock.calls.map(([name]) => name);
            expect(eventNames).toContain('pty-output');
            expect(eventNames).toContain('pty-exit');
        });

        it('is idempotent — subsequent calls do not re-listen', async () => {
            await useBackend().subscribe();
            await useBackend().subscribe();
            expect(mockedListen).toHaveBeenCalledTimes(2);
        });

        it('routes pty-output payloads into appendChunk and marks the bench working', async () => {
            const captured = captureListenHandlers();
            await useBackend().subscribe();
            captured.output!({payload: {experiment: 'crucible', chunk: 'forge online\n'}});
            const sessions = useSessions();
            expect(sessions.buffers.value.crucible).toStrictEqual(['forge online']);
            expect(sessions.states.value.crucible).toBe('working');
        });

        it('routes pty-exit payloads into idle on success and crashed on non-zero', async () => {
            const captured = captureListenHandlers();
            await useBackend().subscribe();
            captured.exit!({payload: {experiment: 'crucible', exit_code: 0}});
            captured.exit!({payload: {experiment: 'gatekeeper', exit_code: 137}});
            const sessions = useSessions();
            expect(sessions.states.value.crucible).toBe('idle');
            expect(sessions.states.value.gatekeeper).toBe('crashed');
        });
    });

    describe('spawnSession', () => {
        it('invokes spawn_session, marks the bench awaiting, and bumps recency', async () => {
            await useBackend().spawnSession('crucible');
            expect(mockedInvoke).toHaveBeenCalledWith('spawn_session', {experiment: 'crucible'});
            const sessions = useSessions();
            expect(sessions.states.value.crucible).toBe('awaiting');
            expect(sessions.recency.value).toContain('crucible');
        });
    });

    describe('writeInput', () => {
        it('invokes write_to_session with the input verbatim', async () => {
            await useBackend().writeInput('crucible', 'phpstan\n');
            expect(mockedInvoke).toHaveBeenCalledWith('write_to_session', {experiment: 'crucible', input: 'phpstan\n'});
        });
    });

    describe('killSession', () => {
        it('invokes kill_session and resets state to idle', async () => {
            const sessions = useSessions();
            sessions.setState('crucible', 'working');
            await useBackend().killSession('crucible');
            expect(mockedInvoke).toHaveBeenCalledWith('kill_session', {experiment: 'crucible'});
            expect(sessions.states.value.crucible).toBe('idle');
        });
    });
});
