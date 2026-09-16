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
