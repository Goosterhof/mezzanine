import {Terminal} from '@xterm/xterm';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {_resetForTests, useLastKeystroke} from '../../src/command/useLastKeystroke';
import {useScientistTerminals} from '../../src/roster/useScientistTerminals';

const ctrlC = () => new KeyboardEvent('keydown', {ctrlKey: true, key: 'c'});
const flush = () => new Promise((resolve) => setTimeout(resolve));

// xterm keeps its custom key handler private: capture what the pool
// attaches, so the wiring (not just the pure chord) is under test.
const armedChord = (id: string) => {
    const attach = vi.spyOn(Terminal.prototype, 'attachCustomKeyEventHandler');
    const slot = useScientistTerminals().get(id);
    const chord = attach.mock.calls[0]?.[0];
    attach.mockRestore();
    if (!chord) throw new Error('no custom key handler was attached');
    return {slot, chord};
};

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

    describe('the copy chord on every bench', () => {
        it('should copy a standing selection to the clipboard and send no ^C', async () => {
            const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
            vi.stubGlobal('navigator', {clipboard: {writeText}});
            const handler = vi.fn<(id: string, data: string) => void>();
            useScientistTerminals().setDataHandler(handler);
            const {slot, chord} = armedChord('a');
            vi.spyOn(slot.terminal, 'hasSelection').mockReturnValue(true);
            vi.spyOn(slot.terminal, 'getSelection').mockReturnValue('the reply');

            expect(chord(ctrlC())).toBe(false);
            await flush();
            expect(writeText).toHaveBeenCalledWith('the reply');
            expect(handler).not.toHaveBeenCalled();
            vi.unstubAllGlobals();
        });

        it('should let Ctrl+C through to the pty when nothing is selected', () => {
            const {chord} = armedChord('a');
            expect(chord(ctrlC())).toBe(true);
        });

        it('should interrupt the colleague by hand when the clipboard refuses', async () => {
            vi.stubGlobal('navigator', {clipboard: {writeText: () => Promise.reject(new Error('denied'))}});
            const handler = vi.fn<(id: string, data: string) => void>();
            useScientistTerminals().setDataHandler(handler);
            const {slot, chord} = armedChord('a');
            vi.spyOn(slot.terminal, 'hasSelection').mockReturnValue(true);

            expect(chord(ctrlC())).toBe(false);
            await flush();
            expect(handler).toHaveBeenCalledWith('a', '\u0003');
            vi.unstubAllGlobals();
        });
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

    describe('the keystroke witness (#00067 P2)', () => {
        it('should note the Mad Scientist’s keydowns, and only his, for the grip gate', () => {
            _resetForTests();
            useScientistTerminals().setKeystrokeWitness('ms');
            const ms = armedChord('ms');
            const heretic = armedChord('heretic');
            heretic.chord(new KeyboardEvent('keydown', {key: 'x'}));
            expect(useLastKeystroke().msSince()).toBe(Number.POSITIVE_INFINITY);
            ms.chord(new KeyboardEvent('keyup', {key: 'x'}));
            expect(useLastKeystroke().msSince()).toBe(Number.POSITIVE_INFINITY);
            expect(ms.chord(new KeyboardEvent('keydown', {key: 'x'}))).toBe(true);
            expect(useLastKeystroke().msSince()).toBeLessThan(1000);
        });

        it('should never take a terminal-generated reply or a paste (onData) for a keystroke', async () => {
            _resetForTests();
            useScientistTerminals().setKeystrokeWitness('ms');
            useScientistTerminals().get('ms').terminal.input('\u001b[?1;2c', false);
            await Promise.resolve();
            expect(useLastKeystroke().msSince()).toBe(Number.POSITIVE_INFINITY);
        });
    });
});
