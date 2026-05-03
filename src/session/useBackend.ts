// useBackend — the Vue side of the IPC bridge.
//
// Wraps the four Tauri commands and the two events that Phase 1C exposes:
// spawn / write / kill commands, pty-output / pty-exit events. The Vue
// state lives in `useSessions`; this composable's only job is to translate
// the wire-level traffic into `useSessions` mutations and to give
// components a typed surface for invoking commands without importing
// `@tauri-apps/api/core` directly.
//
// The pulse dot's working ↔ awaiting transition lives here too: every
// pty-output chunk arms a per-experiment debounce timer; if no further
// chunk arrives within `WORKING_QUIET_MS`, the bench is considered to
// have settled back to awaiting. pty-exit and explicit kill bypass the
// timer entirely.

import {invoke} from '@tauri-apps/api/core';
import {listen, type UnlistenFn} from '@tauri-apps/api/event';

import type {ExperimentId} from './types';

import {useSessions} from './useSessions';

interface OutputPayload {
    experiment: ExperimentId;
    chunk: string;
}

interface ExitPayload {
    experiment: ExperimentId;
    /** -1 indicates the bench could not harvest a real exit code. */
    exit_code: number;
}

const WORKING_QUIET_MS = 1500;

let subscribed = false;
let unlistenOutput: UnlistenFn | null = null;
let unlistenExit: UnlistenFn | null = null;
const quietTimers = new Map<ExperimentId, ReturnType<typeof setTimeout>>();

function clearQuietTimer(id: ExperimentId): void {
    const existing = quietTimers.get(id);
    if (existing !== undefined) {
        clearTimeout(existing);
        quietTimers.delete(id);
    }
}

export function useBackend() {
    const sessions = useSessions();

    return {
        /** Wire pty-output and pty-exit listeners exactly once per app lifetime.
         * Subsequent calls are no-ops. Returns the unlisten functions for
         * test cleanup; callers in production drop them.
         */
        async subscribe(): Promise<{output: UnlistenFn; exit: UnlistenFn}> {
            if (subscribed && unlistenOutput && unlistenExit) {
                return {output: unlistenOutput, exit: unlistenExit};
            }
            unlistenOutput = await listen<OutputPayload>('pty-output', (event) => {
                const id = event.payload.experiment;
                sessions.appendChunk(id, event.payload.chunk);
                sessions.setState(id, 'working');
                clearQuietTimer(id);
                quietTimers.set(
                    id,
                    setTimeout(() => {
                        if (sessions.states.value[id] === 'working') {
                            sessions.setState(id, 'awaiting');
                        }
                        quietTimers.delete(id);
                    }, WORKING_QUIET_MS),
                );
            });
            unlistenExit = await listen<ExitPayload>('pty-exit', (event) => {
                const id = event.payload.experiment;
                clearQuietTimer(id);
                sessions.setState(id, event.payload.exit_code === 0 ? 'idle' : 'crashed');
            });
            subscribed = true;
            return {output: unlistenOutput, exit: unlistenExit};
        },

        async spawnSession(id: ExperimentId): Promise<void> {
            await invoke('spawn_session', {experiment: id});
            sessions.setState(id, 'awaiting');
            sessions.touch(id);
        },

        async writeInput(id: ExperimentId, input: string): Promise<void> {
            await invoke('write_to_session', {experiment: id, input});
        },

        async killSession(id: ExperimentId): Promise<void> {
            await invoke('kill_session', {experiment: id});
            clearQuietTimer(id);
            sessions.setState(id, 'idle');
        },

        /** Test-only: re-arm the singleton subscribe state. */
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
