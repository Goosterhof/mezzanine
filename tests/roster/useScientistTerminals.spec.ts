import {beforeEach, describe, expect, it, vi} from 'vitest';

import {useScientistTerminals} from '../../src/roster/useScientistTerminals';

describe('useScientistTerminals — Phase 2A', () => {
    beforeEach(() => {
        useScientistTerminals().reset();
    });

    it('get(id) creates a fresh slot on first call', () => {
        const terminals = useScientistTerminals();
        expect(terminals.has('a')).toBe(false);
        const slot = terminals.get('a');
        expect(slot.terminal).toBeDefined();
        expect(slot.fit).toBeDefined();
        expect(slot.lastSize).toBeNull();
        expect(terminals.has('a')).toBe(true);
    });

    it('get(id) returns the same slot on subsequent calls', () => {
        const terminals = useScientistTerminals();
        const first = terminals.get('a');
        const second = terminals.get('a');
        expect(second).toBe(first);
    });

    it('ids() enumerates every active slot', () => {
        const terminals = useScientistTerminals();
        terminals.get('a');
        terminals.get('b');
        expect(terminals.ids().sort()).toStrictEqual(['a', 'b']);
    });

    it('dispose tears down the slot and removes it from the registry', () => {
        const terminals = useScientistTerminals();
        const slot = terminals.get('a');
        const disposeSpy = vi.spyOn(slot.terminal, 'dispose');
        terminals.dispose('a');
        expect(disposeSpy).toHaveBeenCalledOnce();
        expect(terminals.has('a')).toBe(false);
    });

    it('dispose is a no-op for an unknown id', () => {
        const terminals = useScientistTerminals();
        expect(() => terminals.dispose('unknown')).not.toThrow();
    });

    it('reset disposes every slot and clears the data handler', () => {
        const terminals = useScientistTerminals();
        terminals.setDataHandler(() => {});
        terminals.get('a');
        terminals.get('b');
        terminals.reset();
        expect(terminals.ids()).toStrictEqual([]);
    });

    it('keystrokes flow through the registered data handler', async () => {
        const terminals = useScientistTerminals();
        const handler = vi.fn<(id: string, data: string) => void>();
        terminals.setDataHandler(handler);
        const slot = terminals.get('a');
        // Bypass the Tauri side and emit synthetic data — xterm's onData
        // disposable is the same listener that real keystrokes fire.
        slot.terminal.input('hi', false);
        // Give microtasks a chance to flush, then assert.
        await Promise.resolve();
        expect(handler).toHaveBeenCalledWith('a', 'hi');
    });

    it('setting the data handler to null silences keystroke routing', async () => {
        const terminals = useScientistTerminals();
        const handler = vi.fn<(id: string, data: string) => void>();
        terminals.setDataHandler(handler);
        terminals.setDataHandler(null);
        const slot = terminals.get('a');
        slot.terminal.input('hi', false);
        await Promise.resolve();
        expect(handler).not.toHaveBeenCalled();
    });
});
