import {invoke} from '@tauri-apps/api/core';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import type {Colleague, Scientist} from '../../src/roster/types';

import {useColleagues} from '../../src/roster/useColleagues';
import {useRoster} from '../../src/roster/useRoster';
import {useScientistTerminals} from '../../src/roster/useScientistTerminals';

const ipc = vi.mocked(invoke);
function scientist(colleague: Colleague): Scientist {
    return {
        id: colleague,
        colleague,
        target: {kind: 'lab-root'},
        mission: colleague,
        state: 'idle',
        startedAt: '',
        lastStateChange: '',
    };
}
function stubBenches(): void {
    ipc.mockImplementation((command, args) => {
        if (command === 'open_colleague') return Promise.resolve(scientist((args as {colleague: Colleague}).colleague));
        if (command === 'read_tube_connections') return Promise.resolve([]);
        return Promise.resolve(undefined);
    });
}
describe('the two colleagues', () => {
    beforeEach(() => {
        useColleagues().reset();
        useRoster().reset();
        useScientistTerminals().reset();
        ipc.mockReset();
        stubBenches();
    });
    it('opens both on entry and reuses their benches on another request', async () => {
        const colleagues = useColleagues();
        await colleagues.openOnEntry();
        await colleagues.open('heretic');
        expect(useRoster().scientists.value.map((s) => s.colleague)).toStrictEqual(['mad-scientist', 'heretic']);
        expect(useRoster().selected.value).toBe('heretic');
        expect(ipc.mock.calls.some(([name]) => name === 'dispatch_scientist' || name === 'dispatch_crier')).toBe(false);
    });
    it('keeps the Heretic usable if the Mad Scientist cannot launch and supports retry', async () => {
        ipc.mockRejectedValueOnce(new Error('Claude missing'));
        const colleagues = useColleagues();
        await colleagues.openOnEntry();
        expect(colleagues.errors.value['mad-scientist']).toContain('Claude missing');
        expect(colleagues.bench('heretic')?.id).toBe('heretic');
        await colleagues.open('mad-scientist');
        expect(colleagues.errors.value['mad-scientist']).toBeUndefined();
        expect(useRoster().scientists.value).toHaveLength(2);
    });
    it('coalesces repeated clicks while a bench is launching', async () => {
        let finish: (s: Scientist) => void = () => {};
        ipc.mockReturnValueOnce(
            new Promise((resolve) => {
                finish = resolve;
            }),
        );
        const colleagues = useColleagues();
        const first = colleagues.open('heretic');
        await colleagues.open('heretic');
        expect(ipc.mock.calls.filter(([name]) => name === 'open_colleague')).toHaveLength(1);
        finish(scientist('heretic'));
        await first;
        expect(colleagues.opening.value).toStrictEqual([]);
    });
    it('does not mistake an old or unrelated listener for this bench', async () => {
        const colleagues = useColleagues();
        expect(colleagues.tubeLabel('heretic')).toBe('Tube offline');
        useRoster().upsert(scientist('heretic'));
        colleagues.connections.value = [{id: 'another-session', identity: 'heretic', delivery: 'queue', error: null}];
        expect(colleagues.tubeLabel('heretic')).toBe('Tube connecting…');
        colleagues.connections.value = [{id: 'heretic', identity: 'heretic', delivery: 'queue', error: null}];
        expect(colleagues.tubeLabel('heretic')).toContain('between turns');
        useRoster().upsert({...scientist('heretic'), state: 'crashed'});
        expect(colleagues.tubeLabel('heretic')).toBe('Tube offline');
    });
    it('clears stale connection claims on read failure and recovers', async () => {
        const colleagues = useColleagues();
        ipc.mockRejectedValueOnce(new Error('tube missing'));
        await colleagues.refreshTube();
        expect(colleagues.tubeLabel('heretic')).toBe('Tube unavailable');
        expect(colleagues.connections.value).toStrictEqual([]);
        await colleagues.refreshTube();
        expect(colleagues.tubeError.value).toBeNull();
    });
    it('removes legacy rows and replaces an ended bench without removing its colleague', async () => {
        const roster = useRoster();
        roster.upsert({...scientist('mad-scientist'), id: 'old', colleague: null});
        roster.upsert({...scientist('heretic'), id: 'expired', state: 'done'});
        roster.upsert(scientist('mad-scientist'));
        await useColleagues().open('heretic');
        expect(roster.scientists.value.map((s) => s.id)).toStrictEqual(['mad-scientist', 'heretic']);
        expect(ipc).toHaveBeenCalledWith('stop_watching_scientist', {scientistId: 'expired'});
    });
});

type Row = {id: string; identity: Colleague; delivery: string; error: null; last_received_id?: unknown};
function row(identity: Colleague, lastReceived: unknown, id: string = identity): Row {
    return {id, identity, delivery: 'queue', error: null, last_received_id: lastReceived};
}

// The Long Bench's crossing rides on `last_received_id` (#00041 §5.4). These
// pin the Heretic's five binding guards on that signal, one spec per guard.
describe('mail arriving at a colleague’s bench — the crossing’s signal', () => {
    let snapshot: Row[] = [];
    beforeEach(() => {
        useColleagues().reset();
        useRoster().reset();
        ipc.mockReset();
        snapshot = [];
        ipc.mockImplementation((command) =>
            Promise.resolve(command === 'read_tube_connections' ? snapshot : undefined),
        );
    });
    async function poll(...rows: Row[]): Promise<Record<Colleague, number>> {
        snapshot = rows;
        const colleagues = useColleagues();
        await colleagues.refreshTube();
        return {...colleagues.tubeArrivals.value};
    }

    it('(a) says mail ARRIVED at the bench — independent of listener status and acknowledgement', async () => {
        await poll(row('heretic', 4));
        // A bench whose listener is broken still received the mail.
        const after = await poll({...row('heretic', 5), delivery: 'error'});
        expect(after.heretic).toBe(1);
        // …and the arrival changes nothing about the listener's own words.
        useRoster().upsert(scientist('heretic'));
        expect(useColleagues().tubeLabel('heretic')).toBe('Tube delivery needs attention');
        snapshot = [{...row('heretic', 5), delivery: 'queue'}];
        await useColleagues().refreshTube();
        expect(useColleagues().tubeLabel('heretic')).toBe('Tube listening · between turns');
        expect(useColleagues().tubeArrivals.value.heretic).toBe(1);
    });

    it('(b) seeds on the first successful snapshot — old mail never replays as a crossing', async () => {
        expect(await poll(row('heretic', 41), row('mad-scientist', 17))).toStrictEqual({
            'mad-scientist': 0,
            heretic: 0,
        });
        expect(await poll(row('heretic', 41), row('mad-scientist', 17))).toStrictEqual({
            'mad-scientist': 0,
            heretic: 0,
        });
        expect((await poll(row('heretic', 42), row('mad-scientist', 17))).heretic).toBe(1);
    });

    it('(b) a failed read is not a snapshot — the baseline survives it', async () => {
        await poll(row('heretic', 3));
        ipc.mockRejectedValueOnce(new Error('tube missing'));
        await useColleagues().refreshTube();
        expect((await poll(row('heretic', 4))).heretic).toBe(1);
    });

    it('(b) re-seeds when the connection is REPLACED — a new id for the identity', async () => {
        await poll(row('heretic', 9, 'first-session'));
        expect((await poll(row('heretic', 12, 'second-session'))).heretic).toBe(0);
        expect((await poll(row('heretic', 13, 'second-session'))).heretic).toBe(1);
    });

    it('(b) follows the live bench’s own connection over a stale one for the same identity', async () => {
        useRoster().upsert({...scientist('heretic'), id: 'live'});
        await poll(row('heretic', 5, 'stale'), row('heretic', 5, 'live'));
        expect((await poll(row('heretic', 6, 'stale'), row('heretic', 6, 'live'))).heretic).toBe(1);
    });

    it('(b) counts the first letter a bench ever receives (null → a number)', async () => {
        await poll(row('mad-scientist', null));
        expect((await poll(row('mad-scientist', 1)))['mad-scientist']).toBe(1);
    });

    it('(c) a missing field (an older tube) is harmless — no crossing, no error', async () => {
        const colleagues = useColleagues();
        const older: Row = row('heretic', 0);
        delete older.last_received_id;
        await expect(poll(older)).resolves.toStrictEqual({'mad-scientist': 0, heretic: 0});
        await poll(older);
        expect(colleagues.tubeError.value).toBeNull();
        // Garbage is treated the same as absence.
        await poll(row('heretic', 'seven'));
        // When the field appears it seeds fresh rather than counting.
        expect((await poll(row('heretic', 30))).heretic).toBe(0);
        expect((await poll(row('heretic', 31))).heretic).toBe(1);
    });

    it('(c) a snapshot that is not a list is ignored', async () => {
        ipc.mockImplementation(() => Promise.resolve({unexpected: true}));
        await useColleagues().refreshTube();
        expect(useColleagues().tubeArrivals.value).toStrictEqual({'mad-scientist': 0, heretic: 0});
    });

    it('(d) one rise is ONE crossing, however many letters it coalesces', async () => {
        await poll(row('heretic', 10));
        expect((await poll(row('heretic', 17))).heretic).toBe(1);
        expect((await poll(row('heretic', 17))).heretic).toBe(1);
    });

    it('(d) a fall (a reset mailbox) re-baselines quietly', async () => {
        await poll(row('heretic', 10));
        expect((await poll(row('heretic', 2))).heretic).toBe(0);
        expect((await poll(row('heretic', 3))).heretic).toBe(1);
        expect((await poll(row('heretic', null))).heretic).toBe(1);
    });

    it('(e) counts rises per identity and never mixes the two benches', async () => {
        await poll(row('heretic', 1), row('mad-scientist', 1));
        const after = await poll(row('heretic', 2), row('mad-scientist', 1));
        expect(after).toStrictEqual({'mad-scientist': 0, heretic: 1});
        expect(await poll(row('heretic', 2))).toStrictEqual({'mad-scientist': 0, heretic: 1});
    });

    it('forgets every baseline on reset', async () => {
        await poll(row('heretic', 5));
        await poll(row('heretic', 6));
        useColleagues().reset();
        expect(useColleagues().tubeArrivals.value.heretic).toBe(0);
        expect((await poll(row('heretic', 7))).heretic).toBe(0);
    });
});
