// useRosterBackend — the Vue side of the Mezzanine IPC bridge.
//
// Wraps the seven Tauri commands (dispatch / recall / list_roster /
// list_recently_recalled / write_to_scientist / resize_scientist /
// transition_scientist) and the two events ('scientist-output' /
// 'scientist-exit'). Output chunks flow into the active scientist's xterm
// Terminal; exit codes mark the scientist as done or crashed via
// transition_scientist (which writes the canonical state on the Rust side).
//
// The output→awaiting debounce of the bench era is retained: a chunk arms
// a quiet-timer for the scientist; if no further output arrives within
// WORKING_QUIET_MS, the scientist transitions back to `awaiting`.

import {invoke} from '@tauri-apps/api/core';
import {listen, type UnlistenFn} from '@tauri-apps/api/event';

import type {MissionState, RecalledScientist, Scientist, ScientistId, Target} from './types';

import {useRoster} from './useRoster';
import {useScientistTerminals} from './useScientistTerminals';

interface OutputPayload {
    scientist: ScientistId;
    chunk: string;
}

interface ExitPayload {
    scientist: ScientistId;
    exit_code: number;
}

const WORKING_QUIET_MS = 1500;

let subscribed = false;
let unlistenOutput: UnlistenFn | null = null;
let unlistenExit: UnlistenFn | null = null;
const quietTimers = new Map<ScientistId, ReturnType<typeof setTimeout>>();

function clearQuietTimer(id: ScientistId): void {
    const existing = quietTimers.get(id);
    if (existing !== undefined) {
        clearTimeout(existing);
        quietTimers.delete(id);
    }
}

async function setLocalState(id: ScientistId, next: MissionState): Promise<void> {
    const roster = useRoster();
    const scientist = roster.scientists.value.find((s) => s.id === id);
    if (scientist && scientist.state !== next) {
        roster.upsert({...scientist, state: next, lastStateChange: new Date().toISOString()});
    }
    // Mirror the state on the Rust side so the chronicle layer / persistence
    // snapshot sees the same view. Swallow errors — the canonical surface
    // for the investor is the local state ref; the Rust mirror is a
    // best-effort follower.
    try {
        await invoke('transition_scientist', {id, next});
    } catch {
        // Ignored — see comment above.
    }
}

export function useRosterBackend() {
    const roster = useRoster();
    const terminals = useScientistTerminals();

    return {
        /** Wire scientist-output and scientist-exit listeners exactly once
         *  per app lifetime, install the xterm keystroke handler, and seed
         *  the roster + recalled strip from the Rust side. Subsequent
         *  calls re-fetch state without re-installing listeners. */
        async subscribe(): Promise<{output: UnlistenFn; exit: UnlistenFn}> {
            if (!subscribed) {
                terminals.setDataHandler((id, data) => {
                    void invoke('write_to_scientist', {id, input: data});
                });
                unlistenOutput = await listen<OutputPayload>('scientist-output', (event) => {
                    const id = event.payload.scientist;
                    if (terminals.has(id)) {
                        terminals.get(id).terminal.write(event.payload.chunk);
                    } else {
                        // Buffer-by-creating the slot on demand keeps the
                        // first burst from being lost if the canvas hasn't
                        // mounted yet — xterm preserves the scrollback even
                        // without an attached DOM element.
                        terminals.get(id).terminal.write(event.payload.chunk);
                    }
                    void setLocalState(id, 'working');
                    clearQuietTimer(id);
                    quietTimers.set(
                        id,
                        setTimeout(() => {
                            const current = roster.scientists.value.find((s) => s.id === id);
                            if (current?.state === 'working') {
                                void setLocalState(id, 'awaiting');
                            }
                            quietTimers.delete(id);
                        }, WORKING_QUIET_MS),
                    );
                });
                unlistenExit = await listen<ExitPayload>('scientist-exit', (event) => {
                    const id = event.payload.scientist;
                    clearQuietTimer(id);
                    void setLocalState(id, event.payload.exit_code === 0 ? 'done' : 'crashed');
                });
                subscribed = true;
            }
            await this.refreshRoster();
            return {output: unlistenOutput as UnlistenFn, exit: unlistenExit as UnlistenFn};
        },

        async refreshRoster(): Promise<void> {
            const list = await invoke<Scientist[]>('list_roster');
            roster.replace(list);
            const recalled = await invoke<RecalledScientist[]>('list_recently_recalled');
            roster.setRecalledStrip(recalled);
        },

        async dispatch(target: Target, mission: string): Promise<Scientist> {
            const scientist = await invoke<Scientist>('dispatch_scientist', {target, mission});
            roster.upsert(scientist);
            roster.select(scientist.id);
            return scientist;
        },

        async recall(id: ScientistId): Promise<void> {
            await invoke('recall_scientist', {id});
            clearQuietTimer(id);
            terminals.dispose(id);
            roster.remove(id);
            // Re-fetch the recalled strip so the row appears with its
            // correct recall timestamp — the Rust side is the timestamp
            // source of truth.
            const recalled = await invoke<RecalledScientist[]>('list_recently_recalled');
            roster.setRecalledStrip(recalled);
        },

        async writeInput(id: ScientistId, input: string): Promise<void> {
            await invoke('write_to_scientist', {id, input});
        },

        async resize(id: ScientistId, cols: number, rows: number): Promise<void> {
            await invoke('resize_scientist', {id, cols, rows});
        },

        /** Test-only — re-arm the singleton subscription state. */
        _resetSubscriptionForTests(): void {
            subscribed = false;
            unlistenOutput = null;
            unlistenExit = null;
            for (const timer of quietTimers.values()) {
                clearTimeout(timer);
            }
            quietTimers.clear();
        },
    };
}
