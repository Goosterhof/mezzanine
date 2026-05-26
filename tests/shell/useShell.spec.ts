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
        shell.togglePanel('drydock');
        expect(shell.openPanel.value).toBe('drydock');
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

    it('accepts holotable as a panel id (arc #00051 absorption)', () => {
        const shell = useShell();
        shell.togglePanel('holotable');
        expect(shell.openPanel.value).toBe('holotable');
        shell.togglePanel('holotable');
        expect(shell.openPanel.value).toBeNull();
    });
});
