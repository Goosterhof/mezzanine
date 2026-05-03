// useBackend — the Vue side of the IPC bridge.
//
// Wraps the four Tauri commands and the two events that Phase 1C exposes:
// spawn / write / kill commands, pty-output / pty-exit events. The Vue
// state lives in `useSessions`; this composable's only job is to translate
// the wire-level traffic into `useSessions` mutations and to give
// components a typed surface for invoking commands without importing
// `@tauri-apps/api/core` directly.

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

let subscribed = false;
let unlistenOutput: UnlistenFn | null = null;
let unlistenExit: UnlistenFn | null = null;

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
                sessions.appendChunk(event.payload.experiment, event.payload.chunk);
                sessions.setState(event.payload.experiment, 'working');
            });
            unlistenExit = await listen<ExitPayload>('pty-exit', (event) => {
                sessions.setState(event.payload.experiment, event.payload.exit_code === 0 ? 'idle' : 'crashed');
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
            sessions.setState(id, 'idle');
        },

        /** Test-only: re-arm the singleton subscribe state. */
        _resetSubscriptionForTests(): void {
            subscribed = false;
            unlistenOutput = null;
            unlistenExit = null;
        },
    };
}
