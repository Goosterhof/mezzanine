// useAscent — singleton state + plugin bridge for the Ascent (#00056).
//
// The balcony rebuilds itself, but never silently (RD-2). This composable
// owns the check-and-prompt flow:
//
//   * check()   — ask the floor below whether a newer balcony stands ready.
//                 Runs once on boot (App.vue, gated on wizard completion) and
//                 on demand. Silent on `idle` for the boot check; a manual
//                 check surfaces the "Balcony current" confirmation.
//   * descend() — the investor consented: stream the signed NSIS bundle, let
//                 the plugin verify its signature against the baked-in pubkey
//                 (RD-4), then relaunch into the rebuilt balcony.
//   * dismiss() — the investor chose to stand pat; the prompt closes for the
//                 session and is re-offered on next boot.
//
// The weight of the feature is config + CI + this slice (RD-5); the Rust side
// is bare plugin registration. The `Update` resource returned by `check()` is
// held module-side so `descend()` can act on it without re-checking.

import {relaunch} from '@tauri-apps/plugin-process';
import {check, type Update} from '@tauri-apps/plugin-updater';
import {computed, ref} from 'vue';

import type {AscentStatus, UpdateMeta} from './types';

const status = ref<AscentStatus>('idle');
const meta = ref<UpdateMeta | null>(null);
const downloadPct = ref(0);
const lastError = ref<string | null>(null);
// True only after a manual (investor-initiated) check resolves `idle`, so the
// boot check stays silent while an on-demand check can confirm "Balcony
// current. Nothing waiting below."
const surfaceCurrent = ref(false);

// The plugin's `Update` resource — held between check() and descend() so the
// descent acts on the exact bundle the check surfaced. Not reactive: it is a
// native handle, not view state.
let activeUpdate: Update | null = null;

/**
 * A signature failure is a security event, not a transient one (RD-4 + §3).
 * Tauri's updater rejects an unsigned/tampered bundle during download with a
 * minisign verification error; we route those to `rejected` (no retry) and
 * everything else to `error` (the balcony stands as it is).
 */
function isSignatureRejection(message: string): boolean {
    const lower = message.toLowerCase();
    return lower.includes('signature') || lower.includes('minisign') || lower.includes('verif');
}

async function checkInternal(options: {surface?: boolean} = {}): Promise<void> {
    // Never stack checks onto an in-flight check or an active descent.
    if (status.value === 'checking' || status.value === 'downloading') {
        return;
    }
    surfaceCurrent.value = false;
    lastError.value = null;
    status.value = 'checking';
    try {
        const update = await check();
        if (update === null) {
            activeUpdate = null;
            meta.value = null;
            surfaceCurrent.value = options.surface === true;
            status.value = 'idle';
            return;
        }
        activeUpdate = update;
        meta.value = {
            version: update.version,
            currentVersion: update.currentVersion,
            date: update.date,
            body: update.body,
        };
        status.value = 'available';
    } catch (error) {
        activeUpdate = null;
        lastError.value = error instanceof Error ? error.message : String(error);
        status.value = 'error';
    }
}

async function descendInternal(): Promise<void> {
    // Descent is only meaningful from an offered update.
    if (status.value !== 'available' || activeUpdate === null) {
        return;
    }
    const update = activeUpdate;
    downloadPct.value = 0;
    lastError.value = null;
    status.value = 'downloading';
    let contentLength = 0;
    let downloaded = 0;
    try {
        await update.downloadAndInstall((event) => {
            if (event.event === 'Started') {
                contentLength = event.data.contentLength ?? 0;
                downloaded = 0;
                downloadPct.value = 0;
            } else if (event.event === 'Progress') {
                downloaded += event.data.chunkLength;
                if (contentLength > 0) {
                    downloadPct.value = Math.min(99, Math.round((downloaded / contentLength) * 100));
                }
            } else {
                // Finished — the bundle is verified and written; the install
                // hands off to relaunch. 100% drives the "stepping down" copy.
                downloadPct.value = 100;
            }
        });
        await relaunch();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        lastError.value = message;
        status.value = isSignatureRejection(message) ? 'rejected' : 'error';
    }
}

function dismissInternal(): void {
    activeUpdate = null;
    meta.value = null;
    surfaceCurrent.value = false;
    status.value = 'idle';
}

export function useAscent() {
    return {
        status,
        meta,
        downloadPct,
        lastError,

        /** The newer balcony's version, when one stands ready. */
        availableVersion: computed((): string | null => meta.value?.version ?? null),

        /**
         * Whether the prompt strip should be on the balcony. Hidden for a
         * silent `idle` (the boot check found nothing); shown when an update
         * waits, while descending, on rejection/error, and for the manual
         * "Balcony current" confirmation.
         */
        visible: computed(
            (): boolean =>
                status.value === 'available' ||
                status.value === 'downloading' ||
                status.value === 'rejected' ||
                status.value === 'error' ||
                (status.value === 'idle' && surfaceCurrent.value),
        ),

        /** Download finished, install handing off to relaunch — "stepping down". */
        isSteppingDown: computed((): boolean => status.value === 'downloading' && downloadPct.value >= 100),

        /** The manual-check "Balcony current. Nothing waiting below." confirmation. */
        showsCurrent: computed((): boolean => status.value === 'idle' && surfaceCurrent.value),

        check: checkInternal,
        descend: descendInternal,
        dismiss: dismissInternal,

        _resetForTests(): void {
            status.value = 'idle';
            meta.value = null;
            downloadPct.value = 0;
            lastError.value = null;
            surfaceCurrent.value = false;
            activeUpdate = null;
        },
    };
}
