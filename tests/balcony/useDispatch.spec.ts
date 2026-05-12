import {invoke} from '@tauri-apps/api/core';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import type {BriefingTemplate} from '../../src/balcony/types';

import {useBriefingLibrary} from '../../src/balcony/useBriefingLibrary';
import {useDispatch} from '../../src/balcony/useDispatch';
import {useRoster} from '../../src/roster/useRoster';

const mockedInvoke = vi.mocked(invoke);

const TEMPLATES: BriefingTemplate[] = [
    {
        id: 'mission-control-sweep',
        label: 'Mission Control sweep',
        description: 'Sweep findings, signals, wounds.',
        targetShape: 'lab-wide',
        openingPrompt: 'Run a Mission Control sweep across the laboratory.',
    },
];

describe('useDispatch — Phase 2B', () => {
    beforeEach(async () => {
        useDispatch().reset();
        useBriefingLibrary().reset();
        useRoster().reset();
        mockedInvoke.mockReset();
        mockedInvoke.mockImplementation((cmd: string) => {
            if (cmd === 'list_briefing_templates') {
                return Promise.resolve(TEMPLATES);
            }
            return Promise.resolve(undefined);
        });
        await useBriefingLibrary().load();
    });

    it('selectTemplate prefills the brief with the template opening prompt', () => {
        const d = useDispatch();
        d.selectTemplate('mission-control-sweep');
        expect(d.templateId.value).toBe('mission-control-sweep');
        expect(d.brief.value).toBe(TEMPLATES[0]!.openingPrompt);
    });

    it('selectTemplate(null) clears the template selection without touching the brief', () => {
        const d = useDispatch();
        d.selectTemplate('mission-control-sweep');
        const beforeBrief = d.brief.value;
        d.selectTemplate(null);
        expect(d.templateId.value).toBeNull();
        expect(d.brief.value).toBe(beforeBrief);
    });

    it('setBrief unbinds the template selection (manual edits are the investor’s own)', () => {
        const d = useDispatch();
        d.selectTemplate('mission-control-sweep');
        expect(d.templateId.value).toBe('mission-control-sweep');
        d.setBrief('something I typed myself');
        expect(d.templateId.value).toBeNull();
        expect(d.brief.value).toBe('something I typed myself');
    });

    it('selectTemplate with an unknown id clears the selection', () => {
        const d = useDispatch();
        d.selectTemplate('does-not-exist');
        expect(d.templateId.value).toBeNull();
    });

    it('submit clears the template selection on success', async () => {
        const d = useDispatch();
        d.setTarget({kind: 'experiment', codename: 'crucible'});
        d.selectTemplate('mission-control-sweep');
        // Stub `dispatch_scientist` directly — useRosterBackend returns a
        // fresh object each call, so spying on an instance wouldn't reach
        // the one useDispatch is holding.
        mockedInvoke.mockImplementation((cmd: string) => {
            if (cmd === 'list_briefing_templates') {
                return Promise.resolve(TEMPLATES);
            }
            if (cmd === 'dispatch_scientist') {
                return Promise.resolve({
                    id: '00000000-0000-4000-8000-000000000000',
                    target: {kind: 'experiment', codename: 'crucible'},
                    mission: 'm',
                    state: 'working',
                    startedAt: '2026-05-12T00:00:00Z',
                    lastStateChange: '2026-05-12T00:00:00Z',
                });
            }
            return Promise.resolve(undefined);
        });
        await d.submit();
        expect(d.templateId.value).toBeNull();
        expect(d.brief.value).toBe('');
        expect(d.target.value).toBeNull();
    });
});
