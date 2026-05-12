import {invoke} from '@tauri-apps/api/core';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import type {BriefingTemplate} from '../../src/balcony/types';

import {useBriefingLibrary} from '../../src/balcony/useBriefingLibrary';

const mockedInvoke = vi.mocked(invoke);

const TEMPLATES: BriefingTemplate[] = [
    {
        id: 'mission-control-sweep',
        label: 'Mission Control sweep',
        description: 'Sweep findings, signals, wounds.',
        targetShape: 'lab-wide',
        openingPrompt: 'Run a Mission Control sweep across the laboratory.',
    },
    {
        id: 'experiment-dossier-read',
        label: 'Experiment dossier read',
        description: 'Read the selected dossier inline.',
        targetShape: 'per-experiment',
        openingPrompt: 'Read the selected experiment dossier in full.',
    },
];

describe('useBriefingLibrary', () => {
    beforeEach(() => {
        useBriefingLibrary().reset();
        mockedInvoke.mockReset();
    });

    it('loads templates from list_briefing_templates and caches them', async () => {
        mockedInvoke.mockResolvedValueOnce(TEMPLATES);
        const lib = useBriefingLibrary();
        await lib.load();
        expect(mockedInvoke).toHaveBeenCalledWith('list_briefing_templates');
        expect(lib.templates.value).toStrictEqual(TEMPLATES);
        expect(lib.loaded.value).toBe(true);

        await lib.load();
        expect(mockedInvoke).toHaveBeenCalledTimes(1);
    });

    it('force reload bypasses the cache', async () => {
        mockedInvoke.mockResolvedValue(TEMPLATES);
        const lib = useBriefingLibrary();
        await lib.load();
        await lib.load(true);
        expect(mockedInvoke).toHaveBeenCalledTimes(2);
    });

    it('captures load errors', async () => {
        mockedInvoke.mockRejectedValueOnce(new Error('bridge collapsed'));
        const lib = useBriefingLibrary();
        await lib.load();
        expect(lib.loadError.value).toBe('bridge collapsed');
        expect(lib.loaded.value).toBe(false);
    });

    it('findById returns the matching template or null', async () => {
        mockedInvoke.mockResolvedValueOnce(TEMPLATES);
        const lib = useBriefingLibrary();
        await lib.load();
        expect(lib.findById('mission-control-sweep')).toStrictEqual(TEMPLATES[0]);
        expect(lib.findById('missing-id')).toBeNull();
    });
});
