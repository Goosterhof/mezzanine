import {describe, it, expect, beforeEach} from 'vitest';

import {useShell} from '../../src/shell/useShell';

describe('useShell', () => {
    beforeEach(() => {
        useShell().reset();
    });

    it('starts with no panel open', () => {
        expect(useShell().openPanel.value).toBeNull();
    });

    it('togglePanel opens a panel that is not currently open', () => {
        const shell = useShell();
        shell.togglePanel('mission-control');
        expect(shell.openPanel.value).toBe('mission-control');
    });

    it('togglePanel closes the panel when called with the open panel', () => {
        const shell = useShell();
        shell.togglePanel('drydock');
        shell.togglePanel('drydock');
        expect(shell.openPanel.value).toBeNull();
    });

    it('togglePanel switches directly between panels', () => {
        const shell = useShell();
        shell.togglePanel('mission-control');
        shell.togglePanel('dossier');
        expect(shell.openPanel.value).toBe('dossier');
    });

    it('closePanel closes whatever is open', () => {
        const shell = useShell();
        shell.togglePanel('drydock');
        shell.closePanel();
        expect(shell.openPanel.value).toBeNull();
    });

    it('closePanel is a no-op when nothing is open', () => {
        const shell = useShell();
        shell.closePanel();
        expect(shell.openPanel.value).toBeNull();
    });

    it('returns the same singleton state across calls', () => {
        useShell().togglePanel('drydock');
        expect(useShell().openPanel.value).toBe('drydock');
    });
});
