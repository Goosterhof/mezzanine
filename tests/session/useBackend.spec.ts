import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {useBackend} from '../../src/session/useBackend';
import {useSessions} from '../../src/session/useSessions';
import {useTerminals} from '../../src/session/useTerminals';

const mockedInvoke = vi.mocked(invoke);
const mockedListen = vi.mocked(listen);

vi.mock('../../src/session/useTerminals', () => {
    const writes = new Map<string, string[]>();
    const stub = {
        get: (id: string) => {
            const log = writes.get(id) ?? [];
            writes.set(id, log);
            return {
                terminal: {
                    write: (chunk: string) => {
                        log.push(chunk);
                    },
                },
                fit: {fit: () => {}},
                lastSize: null,
                dataDisposable: {dispose: () => {}},
            };
        },
        has: (id: string) => writes.has(id),
        setDataHandler: () => {},
        reset: () => {
            writes.clear();
        },
        // Test-only: surface the writes log so specs can assert routing.
        _writes: writes,
    };
    return {useTerminals: () => stub};
});

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
        useTerminals().reset();
        useBackend()._resetSubscriptionForTests();
        mockedInvoke.mockReset();
        mockedInvoke.mockResolvedValue(undefined);
        mockedListen.mockReset();
        mockedListen.mockResolvedValue(() => {});
    });

    afterEach(() => {
        // Roll forward any debounce timers and tear down the fake clock if a
        // test set one up — otherwise leftover timers leak between specs.
        if (vi.isFakeTimers()) {
            vi.runAllTimers();
            vi.useRealTimers();
        }
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

        it('routes pty-output payloads into the per-experiment terminal and marks the bench working', async () => {
            const captured = captureListenHandlers();
            await useBackend().subscribe();
            captured.output!({payload: {experiment: 'crucible', chunk: 'forge online\n'}});
            const sessions = useSessions();
            const terminals = useTerminals() as unknown as {_writes: Map<string, string[]>};
            expect(terminals._writes.get('crucible')).toStrictEqual(['forge online\n']);
            expect(sessions.states.value.crucible).toBe('working');
        });

        it('exposes resizeSession that invokes resize_session with cols and rows', async () => {
            await useBackend().resizeSession('crucible', 132, 40);
            expect(mockedInvoke).toHaveBeenCalledWith('resize_session', {
                experiment: 'crucible',
                cols: 132,
                rows: 40,
            });
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

    describe('working ↔ awaiting debounce', () => {
        it('settles back to awaiting after the quiet window with no further chunks', async () => {
            vi.useFakeTimers();
            const captured = captureListenHandlers();
            await useBackend().subscribe();
            const sessions = useSessions();

            captured.output!({payload: {experiment: 'crucible', chunk: 'forge\n'}});
            expect(sessions.states.value.crucible).toBe('working');

            vi.advanceTimersByTime(1500);
            expect(sessions.states.value.crucible).toBe('awaiting');
        });

        it('resets the timer on every new chunk so streaming output stays working', async () => {
            vi.useFakeTimers();
            const captured = captureListenHandlers();
            await useBackend().subscribe();
            const sessions = useSessions();

            captured.output!({payload: {experiment: 'crucible', chunk: 'first\n'}});
            vi.advanceTimersByTime(1000);
            captured.output!({payload: {experiment: 'crucible', chunk: 'second\n'}});
            vi.advanceTimersByTime(1000);
            // 2000ms total elapsed but the second chunk reset the clock at
            // 1000 — only 1000ms of quiet so the bench is still working.
            expect(sessions.states.value.crucible).toBe('working');

            vi.advanceTimersByTime(500);
            expect(sessions.states.value.crucible).toBe('awaiting');
        });

        it('does not override a state that pty-exit already set', async () => {
            vi.useFakeTimers();
            const captured = captureListenHandlers();
            await useBackend().subscribe();
            const sessions = useSessions();

            captured.output!({payload: {experiment: 'crucible', chunk: 'last gasp\n'}});
            captured.exit!({payload: {experiment: 'crucible', exit_code: 137}});
            expect(sessions.states.value.crucible).toBe('crashed');

            vi.advanceTimersByTime(2000);
            // Debounce timer was cleared on exit; even if it fired, the
            // working-only guard would skip the override.
            expect(sessions.states.value.crucible).toBe('crashed');
        });
    });
});
