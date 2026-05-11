// useTerminals — the bench's xterm pool.
//
// Six experiments, six xterm.js Terminals, all created lazily on first
// activation and kept alive for the gadget's lifetime. Switching tabs
// hides the DOM but preserves cursor position, scrollback, and any
// half-typed input — the same property a real terminal multiplexer has.
//
// Each Terminal's `onData` is wired exactly once at creation and routes
// keystrokes through a module-level handler that App-level wiring
// installs at startup (`setDataHandler`). Tests override the handler.

import {FitAddon} from '@xterm/addon-fit';
import {Terminal, type IDisposable} from '@xterm/xterm';

import {type ExperimentId} from './types';

export interface TerminalSlot {
    terminal: Terminal;
    fit: FitAddon;
    /** Last (cols, rows) pushed to the backend — used to suppress
     *  redundant resize_session invocations on every observer tick. */
    lastSize: {cols: number; rows: number} | null;
    /** xterm's IDisposable for the onData listener. Tests dispose this
     *  via reset(); production never calls reset(). */
    dataDisposable: IDisposable;
}

const BENCH_THEME = {
    background: '#0B0D10',
    foreground: '#E2E5E9',
    cursor: '#D4A24C',
    cursorAccent: '#0B0D10',
    selectionBackground: 'rgba(212, 162, 76, 0.35)',
    black: '#0F1114',
    red: '#F87171',
    green: '#4ADE80',
    yellow: '#D4A24C',
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

const slots = new Map<ExperimentId, TerminalSlot>();
let dataHandler: ((id: ExperimentId, data: string) => void | Promise<void>) | null = null;

function createSlot(id: ExperimentId): TerminalSlot {
    const terminal = new Terminal({
        convertEol: true,
        cursorBlink: true,
        scrollback: 5000,
        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
        fontSize: 13,
        lineHeight: 1.2,
        theme: BENCH_THEME,
        allowProposedApi: true,
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    const dataDisposable = terminal.onData((data) => {
        if (dataHandler) {
            void dataHandler(id, data);
        }
    });
    return {terminal, fit, lastSize: null, dataDisposable};
}

export function useTerminals() {
    return {
        /** Get-or-create the slot for an experiment. */
        get(id: ExperimentId): TerminalSlot {
            let slot = slots.get(id);
            if (!slot) {
                slot = createSlot(id);
                slots.set(id, slot);
            }
            return slot;
        },

        /** True if a slot has been created for this experiment yet. */
        has(id: ExperimentId): boolean {
            return slots.has(id);
        },

        /** Install the keystroke handler. Called once at app startup
         *  (App.vue or useBackend setup). Tests override for isolation. */
        setDataHandler(handler: ((id: ExperimentId, data: string) => void | Promise<void>) | null): void {
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
        },
    };
}
