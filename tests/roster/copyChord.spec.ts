import {describe, expect, it, vi} from 'vitest';

import type {CopyChordTerminal} from '../../src/roster/copyChord';

import {makeCopyChordHandler} from '../../src/roster/copyChord';

// The chord's laws (lifted from the war-tent's WR-0912), proven against fakes: the clipboard and the pty
// stay out so a failed copy is one mock away, not one platform away.

const fakeTerm = (selection: string | null): CopyChordTerminal & {cleared: boolean} => ({
    cleared: false,
    hasSelection: () => selection !== null,
    getSelection: () => selection ?? '',
    clearSelection() {
        this.cleared = true;
    },
});

const chord = (over: Partial<KeyboardEventInit & {type: string}> = {}): KeyboardEvent => {
    const {type = 'keydown', ...init} = over;
    return new KeyboardEvent(type, {ctrlKey: true, key: 'c', ...init});
};

const hooks = () => ({
    copy: vi.fn<(text: string) => Promise<void>>(() => Promise.resolve()),
    interrupt: vi.fn<() => void>(),
});

const flush = () => new Promise((resolve) => setTimeout(resolve));

describe('the copy chord', () => {
    it('should copy a standing selection on Ctrl+C and keep the key off the pty', async () => {
        const term = fakeTerm('the wire text');
        const h = hooks();
        const handler = makeCopyChordHandler(term, h);

        expect(handler(chord())).toBe(false);
        await flush();
        expect(h.copy).toHaveBeenCalledWith('the wire text');
        expect(term.cleared).toBe(true);
        expect(h.interrupt).not.toHaveBeenCalled();
    });

    it('should pass Ctrl+C through unchanged when nothing is selected — the interrupt survives', () => {
        const h = hooks();
        expect(makeCopyChordHandler(fakeTerm(null), h)(chord())).toBe(true);
        expect(h.copy).not.toHaveBeenCalled();
    });

    it('should fire only on keydown — the handler also sees keyup, and a chord must not copy twice', () => {
        const term = fakeTerm('once');
        const h = hooks();
        const handler = makeCopyChordHandler(term, h);
        expect(handler(chord({type: 'keyup'}))).toBe(true);
        expect(h.copy).not.toHaveBeenCalled();
    });

    it('should leave every other key alone', () => {
        const h = hooks();
        const handler = makeCopyChordHandler(fakeTerm('text'), h);
        expect(handler(chord({key: 'v'}))).toBe(true);
        expect(handler(chord({ctrlKey: false}))).toBe(true);
        expect(handler(chord({metaKey: true}))).toBe(true);
        expect(handler(chord({altKey: true}))).toBe(true);
        expect(h.copy).not.toHaveBeenCalled();
    });

    it('should fall back to the interrupt when the clipboard write fails on a plain Ctrl+C', async () => {
        const term = fakeTerm('unreachable clipboard');
        const h = hooks();
        h.copy.mockRejectedValueOnce(new Error('no clipboard'));
        const handler = makeCopyChordHandler(term, h);

        expect(handler(chord())).toBe(false);
        await flush();
        expect(h.interrupt).toHaveBeenCalledTimes(1);
        // The selection stands for the retry — only a successful copy clears.
        expect(term.cleared).toBe(false);
    });

    it('should copy on Ctrl+Shift+C too — the always-copy alias', async () => {
        const term = fakeTerm('aliased');
        const h = hooks();
        expect(makeCopyChordHandler(term, h)(chord({shiftKey: true}))).toBe(false);
        await flush();
        expect(h.copy).toHaveBeenCalledWith('aliased');
    });

    it('should swallow an empty-handed Ctrl+Shift+C — a copy chord is never an interrupt', async () => {
        const h = hooks();
        expect(makeCopyChordHandler(fakeTerm(null), h)(chord({shiftKey: true}))).toBe(false);
        await flush();
        expect(h.copy).not.toHaveBeenCalled();
        expect(h.interrupt).not.toHaveBeenCalled();
    });

    it('should not interrupt when the ALIAS fails a copy — it never carried one to fall back to', async () => {
        const h = hooks();
        h.copy.mockRejectedValueOnce(new Error('no clipboard'));
        expect(makeCopyChordHandler(fakeTerm('text'), h)(chord({shiftKey: true}))).toBe(false);
        await flush();
        expect(h.interrupt).not.toHaveBeenCalled();
    });
});
