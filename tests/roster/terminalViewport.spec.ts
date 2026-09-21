import {Terminal} from '@xterm/xterm';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {bookmarkViewport, restoreViewport} from '../../src/roster/terminalViewport';

describe('the line being read survives terminal reflow', () => {
    let terminal: Terminal;
    beforeEach(async () => {
        terminal = new Terminal({cols: 80, rows: 30, allowProposedApi: true, scrollback: 200});
        await new Promise<void>((resolve) =>
            terminal.write(Array.from({length: 100}, (_, i) => `Conversation line ${i}\r\n`).join(''), resolve),
        );
    });
    afterEach(() => terminal.dispose());

    it('restores the reading line when a smaller window changes the viewport', () => {
        terminal.scrollToLine(20);
        const bookmark = bookmarkViewport(terminal);
        terminal.resize(60, 18);
        restoreViewport(terminal, bookmark);
        expect(terminal.buffer.active.viewportY).toBe(20);
        expect(terminal.buffer.active.getLine(20)?.translateToString(true)).toBe('Conversation line 20');
        expect(bookmark?.isDisposed).toBe(true);
    });
    it('keeps a bookmark through output arriving on another page', async () => {
        terminal.scrollToLine(10);
        const bookmark = bookmarkViewport(terminal);
        await new Promise<void>((resolve) => terminal.write('Background answer\r\n', resolve));
        terminal.resize(60, 18);
        restoreViewport(terminal, bookmark);
        expect(terminal.buffer.active.viewportY).toBe(10);
    });
    it('leaves readers at the live end following new output', () => {
        terminal.scrollToBottom();
        expect(bookmarkViewport(terminal)).toBeUndefined();
        restoreViewport(terminal, undefined);
        expect(terminal.buffer.active.viewportY).toBe(terminal.buffer.active.baseY);
    });
    it('does not jump to a bookmark that has fallen out of scrollback', async () => {
        terminal.scrollToLine(0);
        const bookmark = bookmarkViewport(terminal);
        await new Promise<void>((resolve) => terminal.write('\r\n'.repeat(300), resolve));
        expect(bookmark?.isDisposed).toBe(true);
        const position = terminal.buffer.active.viewportY;
        restoreViewport(terminal, bookmark);
        expect(terminal.buffer.active.viewportY).toBe(position);
    });
    it('does not put normal-buffer bookmarks into a full-screen application', async () => {
        await new Promise<void>((resolve) => terminal.write('\x1b[?1049h', resolve));
        expect(bookmarkViewport(terminal)).toBeUndefined();
    });
});
