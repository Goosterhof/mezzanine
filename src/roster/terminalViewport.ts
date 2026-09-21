import type {IMarker, Terminal} from '@xterm/xterm';

/** Anchor the line being read across output, trimming and width reflow.
 * At the live end there is no bookmark: that reader follows new output. */
export function bookmarkViewport(terminal: Terminal): IMarker | undefined {
    const buffer = terminal.buffer.active;
    if (buffer.type !== 'normal' || buffer.viewportY >= buffer.baseY) return undefined;
    return terminal.registerMarker(buffer.viewportY - buffer.baseY - buffer.cursorY);
}

export function restoreViewport(terminal: Terminal, bookmark: IMarker | undefined): void {
    if (!bookmark) return;
    if (!bookmark.isDisposed) {
        // xterm 6's scrollToLine is relative to its logical viewport, which
        // can diverge from the DOM scrollbar after resize. Clamp to the top
        // using the public API, then restore; both calls happen before paint.
        terminal.scrollLines(-terminal.buffer.active.length);
        terminal.scrollToLine(bookmark.line);
    }
    bookmark.dispose();
}
