// useCriersWatch — singleton state + IPC for The Crier's Watch (#00060).
//
// One composable owns the whole watch-post: the relay's status, the live
// bus queue, the armed crier's scientist id, and the `lastNudgeAt` clock
// that drives the Patrol Lamp's amber pulse. It bridges to three Tauri
// commands (`dispatch_crier`, `recall_crier`, `read_crier_watch_state`) and
// to the `write_to_scientist` command for "Take a turn now."
//
// The nudge clock is the load-bearing subtlety. `lastNudgeAt` must come
// from a REAL push — a `[crier-doorbell] pushed turn` line in the crier's
// PTY stream — not from the queue length on a panel read. A queue-length
// proxy would only update on panel-open-with-queue, so the lamp could
// never pulse while the panel is closed, which is exactly when the Gift
// claims it is most useful. So the composable subscribes to the crier's
// `scientist-output` events directly (the same stream the panel's embedded
// terminal renders) and stamps `lastNudgeAt` the moment a push line lands.

import {invoke} from '@tauri-apps/api/core';
import {listen, type UnlistenFn} from '@tauri-apps/api/event';
import {computed, ref} from 'vue';

import type {ScientistId} from '../roster/types';
import type {CrierWatchState, PatrolLampStatus} from './types';

import {useWizard} from '../wizard/useWizard';
import {EMPTY_WATCH_STATE} from './types';

/** A nudge counts as "recent" for the Patrol Lamp's pulse for five minutes. */
const NUDGE_RECENT_MS = 5 * 60 * 1000;

/** The relay's push-line marker — `[crier-doorbell] pushed turn …`. */
const PUSH_LINE_MARKER = '[crier-doorbell] pushed turn';

interface CrierOutputPayload {
    scientist: ScientistId;
    chunk: string;
}

const state = ref<CrierWatchState>({...EMPTY_WATCH_STATE});
const loading = ref(false);
const error = ref<string | null>(null);
const scientistId = ref<ScientistId | null>(null);
const lastNudgeAt = ref<number | null>(null);

// Patrol-output subscription — installed once, fans the crier's PTY chunks
// to the panel's terminal sink and scans them for push lines.
let outputUnlisten: UnlistenFn | null = null;
let outputSubscribePromise: Promise<void> | null = null;
let terminalSink: ((chunk: string) => void) | null = null;
// A small carry buffer so a `[crier-doorbell] pushed turn` line split across
// two chunks is still detected.
let scanCarry = '';

function scanForNudge(chunk: string): void {
    const combined = scanCarry + chunk;
    if (combined.includes(PUSH_LINE_MARKER)) {
        lastNudgeAt.value = Date.now();
    }
    // Keep only the tail (enough to span a marker straddling the boundary).
    scanCarry = combined.slice(-PUSH_LINE_MARKER.length);
}

function handleOutput(payload: CrierOutputPayload): void {
    // Only the armed crier's stream feeds the watch glass + the nudge clock.
    if (scientistId.value === null || payload.scientist !== scientistId.value) {
        return;
    }
    scanForNudge(payload.chunk);
    if (terminalSink) {
        terminalSink(payload.chunk);
    }
}

async function ensureOutputSubscription(): Promise<void> {
    if (outputSubscribePromise) {
        return outputSubscribePromise;
    }
    outputSubscribePromise = (async () => {
        outputUnlisten = await listen<CrierOutputPayload>('scientist-output', (event) => {
            handleOutput(event.payload);
        });
    })();
    return outputSubscribePromise;
}

/** Map a raw Tauri invoke rejection to a string. */
function asMessage(raw: unknown): string {
    return raw instanceof Error ? raw.message : String(raw);
}

/** Did `dispatch_crier` reject because the token is missing? The Rust side
 *  renders `MezzanineError::ConfigCorrupt` as a string containing
 *  "first-run wizard required" / "config corrupted" — the crier dispatch
 *  reuses that variant for a missing token. */
function isTokenMissingError(message: string): boolean {
    const lower = message.toLowerCase();
    return lower.includes('first-run wizard required') || lower.includes('config corrupted');
}

export function useCriersWatch() {
    return {
        state,
        loading,
        error,
        scientistId,
        lastNudgeAt,

        /** The Patrol Lamp's rhythm, derived from status + nudge recency.
         *  `nudging` — armed AND a real push within the last five minutes.
         *  `watching` — armed, no recent push. `off` — idle / token-missing. */
        lampStatus: computed<PatrolLampStatus>(() => {
            if (state.value.status !== 'armed') {
                return 'off';
            }
            if (lastNudgeAt.value !== null && Date.now() - lastNudgeAt.value < NUDGE_RECENT_MS) {
                return 'nudging';
            }
            return 'watching';
        }),

        /** The sink the panel's embedded terminal installs to receive the
         *  crier's PTY chunks. Setting it does not replay history — xterm's
         *  scrollback handles late mounts via the live stream. */
        setTerminalSink(sink: ((chunk: string) => void) | null): void {
            terminalSink = sink;
        },

        /** Read the watch state through the bridge. Updates `scientistId`
         *  from the local status: armed keeps the tracked id, idle/missing
         *  clears it. */
        async readState(): Promise<void> {
            loading.value = true;
            error.value = null;
            try {
                const payload = await invoke<CrierWatchState>('read_crier_watch_state');
                state.value = payload;
                if (payload.status !== 'armed') {
                    scientistId.value = null;
                }
            } catch (raw) {
                error.value = asMessage(raw);
            } finally {
                loading.value = false;
            }
        },

        /** Arm the patrol on boot — wizard-gated. A no-op if the wizard has
         *  not completed (a fresh install configures itself first). A
         *  missing token is caught and surfaced as `token-missing` without
         *  any alert. */
        async armOnBoot(): Promise<void> {
            const wizard = useWizard();
            if (!wizard.isReady() || wizard.needsWalkthrough.value) {
                return;
            }
            await this.arm();
        },

        /** Arm the patrol — dispatch the crier (idempotent on the Rust
         *  side) and bind the watch glass + nudge clock to its stream. */
        async arm(): Promise<void> {
            error.value = null;
            try {
                const scientist = await invoke<{id: ScientistId}>('dispatch_crier');
                scientistId.value = scientist.id;
                await ensureOutputSubscription();
                await this.readState();
            } catch (raw) {
                const message = asMessage(raw);
                if (isTokenMissingError(message)) {
                    state.value = {...EMPTY_WATCH_STATE, status: 'token-missing'};
                    scientistId.value = null;
                } else {
                    error.value = message;
                }
            }
        },

        /** Stand the patrol down — recall the crier and clear local state. */
        async standDown(): Promise<void> {
            error.value = null;
            try {
                await invoke('recall_crier');
                scientistId.value = null;
                lastNudgeAt.value = null;
                scanCarry = '';
                state.value = {...EMPTY_WATCH_STATE, status: 'idle'};
            } catch (raw) {
                error.value = asMessage(raw);
            }
        },

        /** Take a turn now — write `/town-crier\n` to the crier's PTY,
         *  exactly as if the investor had typed the slash command. No-op
         *  when no crier session is active. */
        async takeTurn(): Promise<void> {
            const id = scientistId.value;
            if (id === null) {
                return;
            }
            try {
                await invoke('write_to_scientist', {id, input: '/town-crier\n'});
            } catch (raw) {
                error.value = asMessage(raw);
            }
        },

        /** Test-only — reset every singleton field + tear down listeners. */
        reset(): void {
            state.value = {...EMPTY_WATCH_STATE};
            loading.value = false;
            error.value = null;
            scientistId.value = null;
            lastNudgeAt.value = null;
            scanCarry = '';
            terminalSink = null;
            if (outputUnlisten) {
                outputUnlisten();
                outputUnlisten = null;
            }
            outputSubscribePromise = null;
        },

        /** Test-only — inject a raw PTY chunk without the Tauri bridge, to
         *  exercise the push-line scan + terminal sink routing. */
        _injectOutputForTests(payload: CrierOutputPayload): void {
            handleOutput(payload);
        },
    };
}
