import {invoke} from '@tauri-apps/api/core';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {useCommandDraft} from '../../src/command/useCommandDraft';
import {useRoster} from '../../src/roster/useRoster';
import {useShell} from '../../src/shell/useShell';

describe('prepare a colleague brief', () => {
    beforeEach(() => {
        useRoster().reset();
        useShell().reset();
        useCommandDraft().draft.value = '';
        vi.mocked(invoke).mockClear();
        useRoster().upsert({
            id: 'heretic',
            colleague: 'heretic',
            target: {kind: 'lab-root'},
            mission: '',
            state: 'idle',
            startedAt: '',
            lastStateChange: '',
        });
    });
    it('selects the existing colleague and fills the draft without sending', () => {
        useShell().navigate('mission-control');
        useCommandDraft().prepare('heretic', 'Inspect this task');
        expect(useRoster().selected.value).toBe('heretic');
        expect(useShell().page.value).toBe('conversation');
        expect(useCommandDraft().draft.value).toBe('Inspect this task');
        expect(invoke).not.toHaveBeenCalled();
    });
    it('preserves an unfinished draft instead of mixing missions or recipients', () => {
        useCommandDraft().draft.value = 'My unfinished thought';
        expect(() => useCommandDraft().prepare('heretic', 'New mission')).toThrow('unfinished draft');
        expect(useCommandDraft().draft.value).toBe('My unfinished thought');
        expect(invoke).not.toHaveBeenCalled();
    });
});
