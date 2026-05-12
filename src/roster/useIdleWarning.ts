// useIdleWarning — per-scientist 1-hour idle detection.
//
// A scientist is "idle-warned" when state === 'idle' and
// now - lastStateChange >= 1 hour. Non-blocking — the row dims and shows
// a soft warning glyph; the scientist keeps running until explicit recall.
//
// The composable exports a reactive `now` ref that ticks every minute. Any
// component reading `isIdleWarning(scientist)` becomes reactive to both the
// scientist's state changes and the wall-clock passing the 1-hour mark.

import {onScopeDispose, ref} from 'vue';

import type {Scientist} from './types';

const IDLE_WARNING_MS = 60 * 60 * 1000;
const TICK_INTERVAL_MS = 60 * 1000;

const now = ref(Date.now());

let tickHandle: ReturnType<typeof setInterval> | null = null;
let refCount = 0;

function startTicking(): void {
    if (tickHandle !== null) {
        return;
    }
    tickHandle = setInterval(() => {
        now.value = Date.now();
    }, TICK_INTERVAL_MS);
}

function stopTicking(): void {
    if (tickHandle === null) {
        return;
    }
    clearInterval(tickHandle);
    tickHandle = null;
}

export function useIdleWarning() {
    refCount += 1;
    startTicking();

    onScopeDispose(() => {
        refCount -= 1;
        if (refCount <= 0) {
            refCount = 0;
            stopTicking();
        }
    });

    return {
        now,

        /** True when the scientist has been idle for at least 1 hour. */
        isIdleWarning(scientist: Scientist): boolean {
            if (scientist.state !== 'idle') {
                return false;
            }
            const last = Date.parse(scientist.lastStateChange);
            if (Number.isNaN(last)) {
                return false;
            }
            return now.value - last >= IDLE_WARNING_MS;
        },

        /** Test-only — force the wall-clock to a specific value and stop
         *  the live interval so assertions are deterministic. */
        _setNowForTests(value: number): void {
            stopTicking();
            now.value = value;
        },

        /** Test-only — reset the refcount and stop the tick. */
        _resetForTests(): void {
            stopTicking();
            refCount = 0;
            now.value = Date.now();
        },
    };
}
