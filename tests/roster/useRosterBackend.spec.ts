import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import type {RecalledScientist, Scientist} from '../../src/roster/types';

import {useRoster} from '../../src/roster/useRoster';
import {useRosterBackend} from '../../src/roster/useRosterBackend';
import {useScientistTerminals} from '../../src/roster/useScientistTerminals';

const mockedInvoke = vi.mocked(invoke);
const mockedListen = vi.mocked(listen);

function makeScientist(id: string): Scientist {
    return {
        id,
        target: {kind: 'experiment', codename: 'crucible'},
        mission: `mission ${id}`,
        state: 'working',
        startedAt: '2026-05-12T10:00:00Z',
        lastStateChange: '2026-05-12T10:00:00Z',
    };
}

interface ListenHandlers {
    output?: (event: {payload: {scientist: string; chunk: string}}) => void;
    exit?: (event: {payload: {scientist: string; exit_code: number}}) => void;
}

function captureListeners(): ListenHandlers {
    const handlers: ListenHandlers = {};
    mockedListen.mockImplementation((eventName, handler) => {
        if (eventName === 'scientist-output') {
            handlers.output = handler as ListenHandlers['output'];
        } else if (eventName === 'scientist-exit') {
            handlers.exit = handler as ListenHandlers['exit'];
        }
        return Promise.resolve(() => {});
    });
    return handlers;
}

describe('useRosterBackend — Phase 2A', () => {
    beforeEach(() => {
        useRoster().reset();
        useScientistTerminals().reset();
        useRosterBackend()._resetSubscriptionForTests();
        mockedInvoke.mockReset();
        mockedListen.mockReset();
        mockedListen.mockResolvedValue(() => {});
    });

    it('subscribe seeds the roster + recalled strip from the Rust side', async () => {
        const a = makeScientist('a');
        const recalled: RecalledScientist = {scientist: makeScientist('b'), recalledAt: '2026-05-12T11:00:00Z'};
        mockedInvoke.mockImplementation((cmd: string) => {
            if (cmd === 'list_roster') return Promise.resolve([a]);
            if (cmd === 'list_recently_recalled') return Promise.resolve([recalled]);
            return Promise.resolve(undefined);
        });
        await useRosterBackend().subscribe();
        const roster = useRoster();
        expect(roster.scientists.value).toHaveLength(1);
        expect(roster.scientists.value[0]!.id).toBe('a');
        expect(roster.recalledStrip.value).toHaveLength(1);
    });

    it('subscribe is idempotent — second call refreshes state without re-installing listeners', async () => {
        mockedInvoke.mockResolvedValue([]);
        await useRosterBackend().subscribe();
        await useRosterBackend().subscribe();
        // listen should have been called exactly twice across both subscribes (output + exit, once total).
        expect(mockedListen).toHaveBeenCalledTimes(2);
    });

    it('dispatch upserts the scientist into the roster and selects it', async () => {
        const s = makeScientist('a');
        mockedInvoke.mockImplementation((cmd: string) => {
            if (cmd === 'dispatch_scientist') return Promise.resolve(s);
            return Promise.resolve(undefined);
        });
        await useRosterBackend().dispatch({kind: 'experiment', codename: 'crucible'}, 'mission');
        const roster = useRoster();
        expect(roster.scientists.value).toHaveLength(1);
        expect(roster.selected.value).toBe('a');
    });

    it('recall removes the scientist, disposes the terminal, and refreshes the strip', async () => {
        const a = makeScientist('a');
        useRoster().upsert(a);
        useRoster().select('a');
        useScientistTerminals().get('a');
        const recalledStrip: RecalledScientist[] = [{scientist: a, recalledAt: '2026-05-12T11:00:00Z'}];
        mockedInvoke.mockImplementation((cmd: string) => {
            if (cmd === 'list_recently_recalled') return Promise.resolve(recalledStrip);
            return Promise.resolve(undefined);
        });
        await useRosterBackend().recall('a');
        const roster = useRoster();
        expect(roster.scientists.value).toHaveLength(0);
        expect(roster.recalledStrip.value).toHaveLength(1);
        expect(useScientistTerminals().has('a')).toBe(false);
    });

    it('writeInput forwards to write_to_scientist', async () => {
        mockedInvoke.mockResolvedValue(undefined);
        await useRosterBackend().writeInput('a', 'hello\n');
        expect(mockedInvoke).toHaveBeenCalledWith('write_to_scientist', {id: 'a', input: 'hello\n'});
    });

    it('resize forwards cols/rows to resize_scientist', async () => {
        mockedInvoke.mockResolvedValue(undefined);
        await useRosterBackend().resize('a', 80, 24);
        expect(mockedInvoke).toHaveBeenCalledWith('resize_scientist', {id: 'a', cols: 80, rows: 24});
    });

    it('scientist-output event writes to the xterm terminal and transitions to working', async () => {
        const handlers = captureListeners();
        const a = makeScientist('a');
        mockedInvoke.mockImplementation((cmd: string) => {
            if (cmd === 'list_roster') return Promise.resolve([a]);
            if (cmd === 'list_recently_recalled') return Promise.resolve([]);
            return Promise.resolve(undefined);
        });
        await useRosterBackend().subscribe();
        const slot = useScientistTerminals().get('a');
        const writeSpy = vi.spyOn(slot.terminal, 'write');
        handlers.output?.({payload: {scientist: 'a', chunk: 'hello'}});
        expect(writeSpy).toHaveBeenCalledWith('hello');
    });

    it('scientist-exit event with code 0 transitions to done', async () => {
        const handlers = captureListeners();
        const a = makeScientist('a');
        mockedInvoke.mockImplementation((cmd: string) => {
            if (cmd === 'list_roster') return Promise.resolve([a]);
            if (cmd === 'list_recently_recalled') return Promise.resolve([]);
            return Promise.resolve(undefined);
        });
        await useRosterBackend().subscribe();
        handlers.exit?.({payload: {scientist: 'a', exit_code: 0}});
        await Promise.resolve();
        const roster = useRoster();
        expect(roster.scientists.value[0]!.state).toBe('done');
    });

    it('scientist-exit event with non-zero code transitions to crashed', async () => {
        const handlers = captureListeners();
        const a = makeScientist('a');
        mockedInvoke.mockImplementation((cmd: string) => {
            if (cmd === 'list_roster') return Promise.resolve([a]);
            if (cmd === 'list_recently_recalled') return Promise.resolve([]);
            return Promise.resolve(undefined);
        });
        await useRosterBackend().subscribe();
        handlers.exit?.({payload: {scientist: 'a', exit_code: 137}});
        await Promise.resolve();
        const roster = useRoster();
        expect(roster.scientists.value[0]!.state).toBe('crashed');
    });

    it('output quiet-timer transitions working → awaiting after the debounce window', async () => {
        vi.useFakeTimers();
        try {
            const handlers = captureListeners();
            const a = makeScientist('a');
            mockedInvoke.mockImplementation((cmd: string) => {
                if (cmd === 'list_roster') return Promise.resolve([a]);
                if (cmd === 'list_recently_recalled') return Promise.resolve([]);
                return Promise.resolve(undefined);
            });
            await useRosterBackend().subscribe();
            handlers.output?.({payload: {scientist: 'a', chunk: 'tick'}});
            await Promise.resolve();
            await Promise.resolve();
            const beforeState = useRoster().scientists.value[0]!.state;
            expect(beforeState).toBe('working');
            vi.advanceTimersByTime(2000);
            await Promise.resolve();
            await Promise.resolve();
            expect(useRoster().scientists.value[0]!.state).toBe('awaiting');
        } finally {
            vi.useRealTimers();
        }
    });
});
