// useMissionControl — singleton state + IPC for the Mission Control panel.
//
// Holds the three laboratory artifacts the panel renders: vital signs,
// pending minion signals, and wound summaries. Refreshes on demand —
// the contract is "read on panel open + manual refresh button," not
// file-watching. Failure is sticky: when a read errors, lastError is
// set and previously-read data stays in place so the panel doesn't
// blank out on a transient failure.

import {invoke} from '@tauri-apps/api/core';
import {ref} from 'vue';

import type {MinionSignal, VitalSigns, WoundSummary} from './types';

import {EMPTY_VITAL_SIGNS} from './types';

const vitalSigns = ref<VitalSigns>({...EMPTY_VITAL_SIGNS});
const signals = ref<MinionSignal[]>([]);
const wounds = ref<WoundSummary[]>([]);
const loading = ref(false);
const lastError = ref<string | null>(null);
const lastRefreshedAt = ref<string | null>(null);

export function useMissionControl() {
    return {
        vitalSigns,
        signals,
        wounds,
        loading,
        lastError,
        lastRefreshedAt,

        /** Read all three sources in parallel and stamp the refresh timestamp.
         * On error: lastError is set; previously-read data stays in place
         * so the panel doesn't go blank on a single transient failure.
         */
        async refresh(): Promise<void> {
            loading.value = true;
            lastError.value = null;
            try {
                const [vs, ms, ws] = await Promise.all([
                    invoke<VitalSigns>('read_vital_signs'),
                    invoke<MinionSignal[]>('read_inheritance_signals'),
                    invoke<WoundSummary[]>('read_wounds_at_threshold'),
                ]);
                vitalSigns.value = vs;
                signals.value = ms;
                wounds.value = ws;
                lastRefreshedAt.value = new Date().toISOString();
            } catch (error) {
                lastError.value = error instanceof Error ? error.message : String(error);
            } finally {
                loading.value = false;
            }
        },

        reset(): void {
            vitalSigns.value = {...EMPTY_VITAL_SIGNS};
            signals.value = [];
            wounds.value = [];
            loading.value = false;
            lastError.value = null;
            lastRefreshedAt.value = null;
        },
    };
}
