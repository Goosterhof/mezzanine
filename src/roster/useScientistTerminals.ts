// useScientistTerminals — xterm.js pool keyed by ScientistId.
//
// Each dispatched scientist gets a dedicated xterm Terminal + FitAddon, lazy
// on first canvas activation, kept alive until the scientist is recalled.
// `onData` routes keystrokes through a module-level handler that
// `useRosterBackend` installs at app startup — every key the investor types
// in any active scientist's canvas becomes a `write_to_scientist` IPC call.

import {FitAddon} from '@xterm/addon-fit';
import {Terminal, type IDisposable} from '@xterm/xterm';

import type {ScientistId} from './types';

import {useLastKeystroke} from '../command/useLastKeystroke';
import {BRASS} from '../shell/brass';
import {makeCopyChordHandler} from './copyChord';

export interface TerminalSlot {
    terminal: Terminal;
    fit: FitAddon;
    /** Last (cols, rows) pushed to the backend — used to suppress
     *  redundant resize_scientist invocations on every observer tick. */
    lastSize: {cols: number; rows: number} | null;
    /** xterm IDisposable for the onData listener. Tests dispose via reset(). */
    dataDisposable: IDisposable;
}

const MEZZANINE_THEME = {
    background: '#0B0D10',
    foreground: '#E2E5E9',
    cursor: BRASS,
    cursorAccent: '#0B0D10',
    selectionBackground: 'rgba(212, 162, 76, 0.35)',
    black: '#0F1114',
    red: '#F87171',
    green: '#4ADE80',
    yellow: BRASS,
    blue: '#60A5FA',
    magenta: '#C084FC',
    cyan: '#67E8F9',
    white: '#E2E5E9',
    brightBlack: '#5B6470',
    brightRed: '#FCA5A5',
    brightGreen: '#86EFAC',
    brightYellow: '#FCD34D',
    brightBlue: '#93C5FD',
    brightMagenta: '#D8B4FE',
    brightCyan: '#A5F3FC',
    brightWhite: '#F3F4F6',
};

const slots = new Map<ScientistId, TerminalSlot>();
let dataHandler: ((id: ScientistId, data: string) => void | Promise<void>) | null = null;
/** The Mad Scientist's terminal: its keydowns gate a minion's grip on the rail (#00067 P2). It is
 *  his terminal the minion climbs over; the Heretic's pane is the other bench. */
let keystrokeWitness: ScientistId | null = null;
const keystrokes = useLastKeystroke();

function createSlot(id: ScientistId): TerminalSlot {
    const terminal = new Terminal({
        convertEol: true,
        cursorBlink: true,
        scrollback: 5000,
        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
        fontSize: 13,
        lineHeight: 1.2,
        theme: MEZZANINE_THEME,
        allowProposedApi: true,
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    // The copy chord, armed before onData can see a key: Ctrl+C with a
    // selection copies it and never reaches the pty; no selection falls
    // through to onData and interrupts, as before. Laws in copyChord.ts. The
    // webview's navigator.clipboard is the lane (no Tauri clipboard plugin is
    // registered); a rejected write falls back to the interrupt.
    const copyChord = makeCopyChordHandler(terminal, {
        copy: async (text) => navigator.clipboard.writeText(text),
        interrupt: () => {
            if (dataHandler) {
                void dataHandler(id, '\u0003');
            }
        },
    });
    // xterm keeps ONE custom key handler: it notes the witness's keystrokes (keydown only — never
    // onData, which also carries pastes and the terminal's own replies), then hands every key on.
    terminal.attachCustomKeyEventHandler((ev) => {
        if (ev.type === 'keydown' && id === keystrokeWitness) keystrokes.note();
        return copyChord(ev);
    });
    const dataDisposable = terminal.onData((data) => {
        if (dataHandler) {
            void dataHandler(id, data);
        }
    });
    return {terminal, fit, lastSize: null, dataDisposable};
}

export function useScientistTerminals() {
    return {
        /** Get-or-create the slot for a scientist. */
        get(id: ScientistId): TerminalSlot {
            let slot = slots.get(id);
            if (!slot) {
                slot = createSlot(id);
                slots.set(id, slot);
            }
            return slot;
        },

        has(id: ScientistId): boolean {
            return slots.has(id);
        },

        /** Tear down a single scientist's terminal — called when recall lands. */
        dispose(id: ScientistId): void {
            const slot = slots.get(id);
            if (!slot) {
                return;
            }
            slot.dataDisposable.dispose();
            slot.terminal.dispose();
            slots.delete(id);
        },

        ids(): ScientistId[] {
            return [...slots.keys()];
        },

        /** Mark the Mad Scientist's terminal: its keydowns hold back a minion's grip. */
        setKeystrokeWitness(id: ScientistId | null): void {
            keystrokeWitness = id;
        },

        setDataHandler(handler: ((id: ScientistId, data: string) => void | Promise<void>) | null): void {
            dataHandler = handler;
        },

        /** Test-only: tear down every terminal and clear the registry. */
        reset(): void {
            for (const slot of slots.values()) {
                slot.dataDisposable.dispose();
                slot.terminal.dispose();
            }
            slots.clear();
            dataHandler = null;
            keystrokeWitness = null;
        },
    };
}
