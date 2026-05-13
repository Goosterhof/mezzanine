import {invoke} from '@tauri-apps/api/core';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import type {WizardDetected, WizardState} from '../../src/wizard/types';

import {useWizard} from '../../src/wizard/useWizard';

const mockedInvoke = vi.mocked(invoke);

function detected(overrides: Partial<WizardDetected> = {}): WizardDetected {
    return {labRoot: '/home/scientist/code/zmuuzn', claudeBinary: 'claude', hostPlatform: 'unix', ...overrides};
}

function persistedNull(): WizardState {
    return {completedAt: null, labRoot: null, claudeBinary: null};
}

function persistedComplete(stamp: string): WizardState {
    return {completedAt: stamp, labRoot: '/home/scientist/code/zmuuzn', claudeBinary: 'claude'};
}

function mockBootCalls(state: WizardState, det: WizardDetected): void {
    mockedInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'read_wizard_state') return Promise.resolve(state);
        if (cmd === 'read_wizard_detected') return Promise.resolve(det);
        return Promise.resolve(undefined);
    });
}

describe('useWizard', () => {
    beforeEach(() => {
        useWizard().reset();
        mockedInvoke.mockReset();
    });

    it('starts not-ready and not-needing the wizard before loadStatus runs', () => {
        const w = useWizard();
        expect(w.isReady()).toBe(false);
        expect(w.needsWalkthrough.value).toBe(false);
    });

    it('loadStatus marks ready and flags needsWalkthrough when nothing is persisted', async () => {
        mockBootCalls(persistedNull(), detected());
        const w = useWizard();
        await w.loadStatus();
        expect(w.isReady()).toBe(true);
        expect(w.needsWalkthrough.value).toBe(true);
    });

    it('loadStatus prefills the drafts with the detected defaults when nothing is persisted', async () => {
        mockBootCalls(persistedNull(), detected({labRoot: '/var/lab', claudeBinary: '/opt/claude'}));
        const w = useWizard();
        await w.loadStatus();
        expect(w.labRootDraft.value).toBe('/var/lab');
        expect(w.claudeBinaryDraft.value).toBe('/opt/claude');
    });

    it('loadStatus restores persisted answers when the wizard already ran', async () => {
        mockBootCalls(persistedComplete('2026-05-13T14:00:00Z'), detected({labRoot: '/var/lab'}));
        const w = useWizard();
        await w.loadStatus();
        expect(w.needsWalkthrough.value).toBe(false);
        expect(w.labRootDraft.value).toBe('/home/scientist/code/zmuuzn');
    });

    it('canAdvance is false on step 1 when lab root is empty, true once it is filled', async () => {
        mockBootCalls(persistedNull(), detected({labRoot: ''}));
        const w = useWizard();
        await w.loadStatus();
        expect(w.activeStep.value).toBe('laboratory');
        expect(w.canAdvance.value).toBe(false);
        w.setLabRoot('/tmp/lab');
        expect(w.canAdvance.value).toBe(true);
    });

    it('canAdvance is always true on step 2 (binary defaults to "claude" when blank)', async () => {
        mockBootCalls(persistedNull(), detected());
        const w = useWizard();
        await w.loadStatus();
        w.goNext();
        expect(w.activeStep.value).toBe('binary');
        w.setClaudeBinary('');
        expect(w.canAdvance.value).toBe(true);
    });

    it('goNext advances laboratory → binary → chronicle and clamps at chronicle', async () => {
        mockBootCalls(persistedNull(), detected());
        const w = useWizard();
        await w.loadStatus();
        expect(w.activeStep.value).toBe('laboratory');
        w.goNext();
        expect(w.activeStep.value).toBe('binary');
        w.goNext();
        expect(w.activeStep.value).toBe('chronicle');
        // No fourth step — clamp.
        w.goNext();
        expect(w.activeStep.value).toBe('chronicle');
    });

    it('goBack moves backwards and clamps at the first step', async () => {
        mockBootCalls(persistedNull(), detected());
        const w = useWizard();
        await w.loadStatus();
        w.goNext();
        w.goNext();
        expect(w.activeStep.value).toBe('chronicle');
        w.goBack();
        expect(w.activeStep.value).toBe('binary');
        w.goBack();
        expect(w.activeStep.value).toBe('laboratory');
        w.goBack();
        expect(w.activeStep.value).toBe('laboratory');
    });

    it('submit persists the wizard state and dispatches the disclosure ack', async () => {
        mockBootCalls(persistedNull(), detected());
        const w = useWizard();
        await w.loadStatus();
        w.setLabRoot('/srv/zmuuzn');
        w.setClaudeBinary('claude');

        const stamped: WizardState = {
            completedAt: '2026-05-13T14:00:00Z',
            labRoot: '/srv/zmuuzn',
            claudeBinary: 'claude',
        };
        mockedInvoke.mockImplementation((cmd: string) => {
            if (cmd === 'complete_wizard') return Promise.resolve(stamped);
            if (cmd === 'write_chronicle_disclosure_ack') {
                return Promise.resolve('2026-05-13T14:00:01Z');
            }
            return Promise.resolve(undefined);
        });

        await w.submit();
        expect(w.needsWalkthrough.value).toBe(false);
        expect(w.persisted.value).toStrictEqual(stamped);
        expect(mockedInvoke).toHaveBeenCalledWith('complete_wizard', {
            submission: {labRoot: '/srv/zmuuzn', claudeBinary: 'claude'},
        });
        expect(mockedInvoke).toHaveBeenCalledWith('write_chronicle_disclosure_ack');
    });

    it('submit sends claudeBinary: null when the draft is blank', async () => {
        mockBootCalls(persistedNull(), detected());
        const w = useWizard();
        await w.loadStatus();
        w.setLabRoot('/srv/zmuuzn');
        w.setClaudeBinary('   ');

        let submission: Record<string, unknown> | undefined;
        mockedInvoke.mockImplementation((cmd: string, args?: unknown) => {
            if (cmd === 'complete_wizard') {
                const cast = args as {submission?: Record<string, unknown>} | undefined;
                submission = cast?.submission;
                return Promise.resolve({completedAt: 'now', labRoot: '/srv/zmuuzn', claudeBinary: null});
            }
            return Promise.resolve(undefined);
        });

        await w.submit();
        expect(submission).toStrictEqual({labRoot: '/srv/zmuuzn', claudeBinary: null});
    });

    it('submit refuses when lab root is empty and rewinds to step 1', async () => {
        mockBootCalls(persistedNull(), detected({labRoot: ''}));
        const w = useWizard();
        await w.loadStatus();
        w.goNext();
        w.goNext();
        w.setLabRoot('   ');

        await w.submit();
        expect(w.activeStep.value).toBe('laboratory');
        expect(w.lastError.value).toMatch(/laboratory/i);
        expect(mockedInvoke).not.toHaveBeenCalledWith('complete_wizard', expect.anything());
    });

    it('captures backend errors into lastError without flipping completion', async () => {
        mockBootCalls(persistedNull(), detected());
        const w = useWizard();
        await w.loadStatus();
        w.setLabRoot('/srv/zmuuzn');

        mockedInvoke.mockImplementation((cmd: string) => {
            if (cmd === 'complete_wizard') {
                return Promise.reject(new Error('disk corrupt'));
            }
            return Promise.resolve(undefined);
        });

        await w.submit();
        expect(w.lastError.value).toBe('disk corrupt');
        expect(w.needsWalkthrough.value).toBe(true);
    });

    it('captures loadStatus errors and still marks the wizard ready', async () => {
        mockedInvoke.mockImplementation((cmd: string) => {
            if (cmd === 'read_wizard_state') return Promise.reject(new Error('config corrupted'));
            return Promise.resolve(detected());
        });
        const w = useWizard();
        await w.loadStatus();
        expect(w.isReady()).toBe(true);
        expect(w.lastError.value).toBe('config corrupted');
    });
});
