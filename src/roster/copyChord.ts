// The copy chord — Ctrl+C on a bench copies the selection instead of
// interrupting the colleague.
//
// Lifted from the war-tent's seat chord (WR-0912, Commander ruling
// 2026-08-24), where it is proven daily: copy when there is a selection, pass
// the interrupt through otherwise. Nothing is lost — a bench with no selection
// keeps Ctrl+C (and Claude's double-Ctrl+C exit, Codex's interrupt) exactly as
// before; Ctrl+Shift+C is the terminal-standard always-copy alias.
//
// Before this, xterm owned the keyboard and every Ctrl+C became a ^C on the
// pty: the investor could select a reply on the Long Bench and never get it
// out of the balcony.
//
// This is the pure layer: a factory returning the predicate for xterm's
// `attachCustomKeyEventHandler` (returning false stops the key from ever
// reaching `onData`, so no ^C hits the pty). `useScientistTerminals` owns the
// wiring; the hooks keep the clipboard and the pty out of this module so the
// chord's laws are unit-testable without either.

export interface CopyChordTerminal {
    hasSelection(): boolean;
    getSelection(): string;
    clearSelection(): void;
}

export interface CopyChordHooks {
    /** Write the selection to the clipboard; reject on failure. */
    copy: (text: string) => Promise<void>;
    /**
     * The old behaviour, held in reserve: a FAILED clipboard write on a plain
     * Ctrl+C must still interrupt the colleague rather than silently swallow
     * the chord — the handler already returned false, so the caller sends the
     * ^C to the pty by hand.
     */
    interrupt: () => void;
}

export function makeCopyChordHandler(term: CopyChordTerminal, hooks: CopyChordHooks): (ev: KeyboardEvent) => boolean {
    return (ev) => {
        // The custom key handler fires for keydown AND keyup (and repeats) —
        // gate on keydown or every chord copies twice.
        if (ev.type !== 'keydown') return true;
        if (!ev.ctrlKey || ev.metaKey || ev.altKey) return true;
        if (ev.key !== 'c' && ev.key !== 'C') return true;

        // Ctrl+Shift+C — the always-copy alias. Never an interrupt, even
        // empty-handed: swallowing it beats typing a stray ^C from a chord
        // every terminal user means as "copy".
        const alwaysCopy = ev.shiftKey;
        if (!term.hasSelection()) return !alwaysCopy;

        const text = term.getSelection();
        hooks
            .copy(text)
            .then(() => {
                // Cleared only on success — a failed copy keeps the selection
                // standing for the retry.
                term.clearSelection();
            })
            .catch(() => {
                // Fall back to the interrupt — but only for the plain chord;
                // the alias never carried an interrupt to fall back to.
                if (!alwaysCopy) hooks.interrupt();
            });
        return false;
    };
}
