// useDisclosure — singleton state for the chronicle privacy disclosure.
//
// Until the investor acknowledges, the chronicle writer on the Rust side
// stays paused — pty traffic flows but nothing lands on disk. App.vue
// checks `read_chronicle_disclosure` at boot. If the value is null, the
// PrivacyDisclosure modal is mounted blocking-style; an `acknowledge()`
// call writes today's stamp via `write_chronicle_disclosure_ack` and
// dismisses the modal.

import {invoke} from '@tauri-apps/api/core';
import {ref} from 'vue';

const acknowledgedAt = ref<string | null>(null);
const checked = ref(false);
const submitting = ref(false);
const lastError = ref<string | null>(null);

export function useDisclosure() {
    return {
        acknowledgedAt,
        checked,
        submitting,
        lastError,

        /** True once we've heard from the backend whether an ack exists.
         * The disclosure modal only renders when this is true AND the
         * ack value is null, to avoid a flicker on first paint. */
        isReady(): boolean {
            return checked.value;
        },

        needsAcknowledgement(): boolean {
            return checked.value && acknowledgedAt.value === null;
        },

        async loadStatus(): Promise<void> {
            try {
                const result = await invoke<string | null>('read_chronicle_disclosure');
                acknowledgedAt.value = result;
            } catch (error) {
                lastError.value = error instanceof Error ? error.message : String(error);
            } finally {
                checked.value = true;
            }
        },

        async acknowledge(): Promise<void> {
            if (submitting.value) {
                return;
            }
            submitting.value = true;
            lastError.value = null;
            try {
                const stamp = await invoke<string>('write_chronicle_disclosure_ack');
                acknowledgedAt.value = stamp;
            } catch (error) {
                lastError.value = error instanceof Error ? error.message : String(error);
            } finally {
                submitting.value = false;
            }
        },

        reset(): void {
            acknowledgedAt.value = null;
            checked.value = false;
            submitting.value = false;
            lastError.value = null;
        },
    };
}
