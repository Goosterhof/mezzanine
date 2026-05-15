import {invoke} from '@tauri-apps/api/core';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import type {MinionSignal, VitalSigns, WoundSummary} from '../../src/mission/types';

import {useMissionControl} from '../../src/mission/useMissionControl';

const mockedInvoke = vi.mocked(invoke);

const VITAL_SIGNS: VitalSigns = {
    experimentsActive: 6,
    experimentsSummary: '6 active',
    gadgetsCalibrated: 5,
    gadgetsSummary: '5 calibrated',
    packagesPublished: 1,
    packagesSummary: '1 published',
    minionsOperational: 18,
    minionsSummary: '18 operational',
    sentinelsWatching: 4,
    sentinelsSummary: '4 watching',
    lastChaos: '#00068',
    chaosFiled: '68 reports',
    enhanceFiled: '5 reports',
};

const SIGNALS: MinionSignal[] = [
    {
        date: '2026-04-15',
        source: 'The Inheritance',
        signalType: 'Neglect Alert',
        target: 'War Table',
        message: 'Attention 28/100',
        recommendedDispatch: '@muse war-table',
    },
];

const WOUNDS: WoundSummary[] = [{filename: 'wound-1.md', modifiedAt: '2026-05-01T10:00:00Z', sizeBytes: 200}];

function stubInvoke(): void {
    mockedInvoke.mockImplementation((cmd: string) => {
        switch (cmd) {
            case 'read_vital_signs':
                return Promise.resolve(VITAL_SIGNS);
            case 'read_inheritance_signals':
                return Promise.resolve(SIGNALS);
            case 'read_wounds_at_threshold':
                return Promise.resolve(WOUNDS);
            default:
                return Promise.resolve(undefined);
        }
    });
}

describe('useMissionControl', () => {
    beforeEach(() => {
        useMissionControl().reset();
        mockedInvoke.mockReset();
        stubInvoke();
    });

    describe('refresh', () => {
        it('reads all three mission-control sources in parallel', async () => {
            await useMissionControl().refresh();
            const cmds = mockedInvoke.mock.calls.map(([cmd]) => cmd);
            expect(cmds).toContain('read_vital_signs');
            expect(cmds).toContain('read_inheritance_signals');
            expect(cmds).toContain('read_wounds_at_threshold');
        });

        it('hydrates the singleton refs from the command results', async () => {
            const mc = useMissionControl();
            await mc.refresh();
            expect(mc.vitalSigns.value).toStrictEqual(VITAL_SIGNS);
            expect(mc.signals.value).toStrictEqual(SIGNALS);
            expect(mc.wounds.value).toStrictEqual(WOUNDS);
            expect(mc.lastRefreshedAt.value).not.toBeNull();
        });

        it('toggles loading and clears the loading flag when reads finish', async () => {
            const mc = useMissionControl();
            const pending = mc.refresh();
            expect(mc.loading.value).toBe(true);
            await pending;
            expect(mc.loading.value).toBe(false);
        });

        it('captures errors into lastError and keeps prior data intact', async () => {
            const mc = useMissionControl();
            await mc.refresh();
            const priorSignals = mc.signals.value;
            mockedInvoke.mockReset();
            mockedInvoke.mockRejectedValueOnce(new Error('CLAUDE.md missing'));
            // The remaining commands resolve so we hit the rejection in the parallel race.
            mockedInvoke.mockResolvedValue([]);

            await mc.refresh();
            expect(mc.lastError.value).toBe('CLAUDE.md missing');
            expect(mc.signals.value).toStrictEqual(priorSignals);
        });
    });
});
