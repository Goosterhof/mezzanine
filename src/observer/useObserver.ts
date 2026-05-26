// useObserver — singleton composable for the chronicle subscription.
//
// Subscribes to the `chronicle-event` Tauri channel once (on the first
// `subscribe()` call), routes inbound events by `scientistId`, calls
// `inferActivity` on each event's turn, and maintains a per-scientist
// `ActivityState` map that `LabScene` reads. Per-scientist idle timers
// reset each event; after 30 seconds of quiescence the scientist's state
// reverts to `idle`.
//
// The composable also exports `activityFromMission(state)` — a fallback
// that maps the Mezzanine's MissionState (idle / working / awaiting /
// done / crashed) to an ActivityState when the chronicle stream is
// silent. This is the floor's voice when the agent transcript has not
// yet produced a tool_use event but the dispatch has fired: a freshly
// dispatched scientist shows `thinking` from MissionState=Working until
// the first inference event arrives.

import {listen, type UnlistenFn} from '@tauri-apps/api/event';
import {computed, ref} from 'vue';

import type {MissionState, ScientistId} from '../roster/types';
import type {ActivityState, ChronicleEvent, ScientistActivity} from './types';

import {inferActivity} from './activityInference';

const IDLE_TIMEOUT_MS = 30_000;

const activities = ref<Map<ScientistId, ScientistActivity>>(new Map());
const idleTimers = new Map<ScientistId, ReturnType<typeof setTimeout>>();
let unlisten: UnlistenFn | null = null;
let subscribePromise: Promise<void> | null = null;

/** Map a MissionState to the most-natural ActivityState when chronicle
 *  inference has nothing to say. */
export function activityFromMission(state: MissionState | null | undefined): ActivityState {
    switch (state) {
        case 'working':
            return 'thinking';
        case 'awaiting':
            return 'waiting';
        case 'crashed':
            return 'error';
        case 'done':
        case 'idle':
        case null:
        case undefined:
        default:
            return 'idle';
    }
}

function scheduleIdleReversion(scientistId: ScientistId): void {
    const existing = idleTimers.get(scientistId);
    if (existing) {
        clearTimeout(existing);
    }
    const timer = setTimeout(() => {
        const current = activities.value.get(scientistId);
        if (!current) return;
        const next = new Map(activities.value);
        next.set(scientistId, {state: 'idle', detail: '...', lastEventAt: Date.now()});
        activities.value = next;
        idleTimers.delete(scientistId);
    }, IDLE_TIMEOUT_MS);
    idleTimers.set(scientistId, timer);
}

function handleChronicleEvent(payload: ChronicleEvent): void {
    const {scientistId, turn} = payload;
    // The Pixel Lab inference functions take a generic Record — the
    // chronicle turn shape is wrapped, but if a future arc lands
    // agent-structured JSONL inside the payload, the inference will
    // begin returning non-null results without any code change here.
    const inferred = inferActivity(turn as unknown as Record<string, unknown>);
    const next = new Map(activities.value);
    if (inferred) {
        next.set(scientistId, {state: inferred.activity, detail: inferred.detail, lastEventAt: Date.now()});
    } else {
        // No inference signal — keep prior activity but advance the
        // event timestamp so the idle timer does not fire prematurely.
        const prior = next.get(scientistId);
        if (prior) {
            next.set(scientistId, {...prior, lastEventAt: Date.now()});
        } else {
            // First event for this scientist with no inference signal —
            // record idle so the LabScene has a state to render.
            next.set(scientistId, {state: 'idle', detail: '...', lastEventAt: Date.now()});
        }
    }
    activities.value = next;
    scheduleIdleReversion(scientistId);
}

export function useObserver() {
    return {
        activities: computed(() => activities.value),

        /** Subscribe to chronicle-event on the Tauri bridge. Idempotent —
         *  the second call awaits the first promise. */
        async subscribe(): Promise<void> {
            if (subscribePromise) {
                return subscribePromise;
            }
            subscribePromise = (async () => {
                unlisten = await listen<ChronicleEvent>('chronicle-event', (event) => {
                    handleChronicleEvent(event.payload);
                });
            })();
            return subscribePromise;
        },

        /** Drop the Tauri listener and clear all timers. Called from the
         *  app teardown path; safe to call multiple times. */
        unsubscribe(): void {
            if (unlisten) {
                unlisten();
                unlisten = null;
            }
            subscribePromise = null;
            for (const timer of idleTimers.values()) {
                clearTimeout(timer);
            }
            idleTimers.clear();
        },

        /** Read the activity state for a scientist. Returns `idle` if no
         *  events have arrived. */
        getActivityState(scientistId: ScientistId): ActivityState {
            return activities.value.get(scientistId)?.state ?? 'idle';
        },

        /** Read the activity detail string for a scientist. */
        getActivityDetail(scientistId: ScientistId): string {
            return activities.value.get(scientistId)?.detail ?? '...';
        },

        /** Drop the in-memory activity state for a scientist when they
         *  are recalled. */
        forget(scientistId: ScientistId): void {
            const timer = idleTimers.get(scientistId);
            if (timer) {
                clearTimeout(timer);
                idleTimers.delete(scientistId);
            }
            if (activities.value.has(scientistId)) {
                const next = new Map(activities.value);
                next.delete(scientistId);
                activities.value = next;
            }
        },

        /** Test-only — drop all state. */
        reset(): void {
            for (const timer of idleTimers.values()) {
                clearTimeout(timer);
            }
            idleTimers.clear();
            activities.value = new Map();
            unlisten = null;
            subscribePromise = null;
        },

        /** Test-only — inject an event without going through the Tauri
         *  bridge. Tests use this to verify routing and idle behaviour. */
        _injectEventForTests(payload: ChronicleEvent): void {
            handleChronicleEvent(payload);
        },
    };
}
