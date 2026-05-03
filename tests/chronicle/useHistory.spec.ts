import {invoke} from '@tauri-apps/api/core';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import type {ChronicleTurn} from '../../src/chronicle/types';

import {useHistory} from '../../src/chronicle/useHistory';

const mockedInvoke = vi.mocked(invoke);

const TURNS: ChronicleTurn[] = [
    {ts: '2026-05-01T10:00:00Z', direction: 'in', payload: 'phpstan\n'},
    {ts: '2026-05-01T10:00:01Z', direction: 'out', payload: 'ok\n'},
];

describe('useHistory', () => {
    beforeEach(() => {
        useHistory().reset();
        mockedInvoke.mockReset();
        mockedInvoke.mockImplementation((cmd: string) => {
            if (cmd === 'read_chronicle_history') {
                return Promise.resolve(TURNS);
            }
            return Promise.resolve(undefined);
        });
    });

    it("show() opens the pane and reads the experiment's last 7 days", async () => {
        const history = useHistory();
        await history.show('crucible');
        expect(history.open.value).toBe(true);
        expect(history.experiment.value).toBe('crucible');
        expect(mockedInvoke).toHaveBeenCalledWith('read_chronicle_history', {experiment: 'crucible', days: 7});
        expect(history.turns.value).toStrictEqual(TURNS);
    });

    it('refresh() is a no-op when no experiment is set', async () => {
        const history = useHistory();
        await history.refresh();
        expect(mockedInvoke).not.toHaveBeenCalled();
    });

    it('captures errors into lastError without throwing', async () => {
        mockedInvoke.mockRejectedValueOnce(new Error('chronicle missing'));
        const history = useHistory();
        history.experiment.value = 'crucible';
        await history.refresh();
        expect(history.lastError.value).toBe('chronicle missing');
    });

    it('close() flips open to false but keeps the loaded turns intact', async () => {
        const history = useHistory();
        await history.show('crucible');
        history.close();
        expect(history.open.value).toBe(false);
        expect(history.turns.value).toStrictEqual(TURNS);
    });
});
